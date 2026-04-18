/**
 * ContractService — Soroban smart contract deployment, invocation, and simulation.
 *
 * Wraps the @stellar/stellar-sdk v15 to provide:
 * - WASM upload + contract instantiation (deploy)
 * - State-changing contract invocations with transaction signing and submission
 * - Read-only contract simulations (no transaction submitted)
 * - Inter-contract authorization via subAuth parameter
 * - XDR serialization/deserialization with nativeToScVal / scValToNative
 *
 * All environment configuration (SOROBAN_RPC_URL, STELLAR_NETWORK_PASSPHRASE) is
 * read from process.env at call time — NOT at module level — to avoid triggering
 * env.ts validation (which calls process.exit) during test imports.
 *
 * @see Requirements 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4
 */

import {
  Keypair,
  TransactionBuilder,
  Networks,
  Operation,
  Contract,
  Account,
  xdr,
  Address,
  nativeToScVal,
  scValToNative,
  BASE_FEE,
} from '@stellar/stellar-sdk';
import { rpc } from '@stellar/stellar-sdk';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Describes a sub-contract authorization entry for inter-contract calls.
 * When a contract function invokes another contract, the caller must include
 * authorization entries for the sub-contract invocations.
 */
export interface SubContractAuth {
  /** The Soroban contract ID (C... address) of the sub-contract being called */
  contractId: string;
  /** The function name being invoked on the sub-contract */
  functionName: string;
  /** The arguments to the sub-contract function call */
  args: xdr.ScVal[];
  /** Nested sub-invocations if the sub-contract itself calls other contracts */
  subInvocations?: SubContractAuth[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Default Soroban RPC URL when SOROBAN_RPC_URL env var is not set. */
const DEFAULT_SOROBAN_RPC_URL = 'https://soroban-testnet.stellar.org';

/** Transaction submission timeout in seconds. */
const TX_TIMEOUT_SECONDS = 30;

/** Maximum polling attempts when waiting for transaction confirmation. */
const POLL_MAX_ATTEMPTS = 15;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns the Soroban RPC server URL from process.env, falling back to the
 * Stellar testnet endpoint if not set.
 */
export function getSorobanRpcUrl(): string {
  return process.env.SOROBAN_RPC_URL || DEFAULT_SOROBAN_RPC_URL;
}

/**
 * Returns the Stellar network passphrase from process.env, falling back to
 * the public testnet passphrase if not set.
 */
function getNetworkPassphrase(): string {
  return process.env.STELLAR_NETWORK_PASSPHRASE || Networks.TESTNET;
}

/**
 * Creates a new Soroban RPC Server instance pointed at the configured URL.
 * A fresh instance is created per call so that env changes between
 * calls (e.g. in tests) are respected.
 */
export function getSorobanServer(): rpc.Server {
  return new rpc.Server(getSorobanRpcUrl(), { allowHttp: true });
}

/**
 * Builds sub-invocation authorization entries from SubContractAuth descriptors.
 * Recursively constructs the xdr.SorobanAuthorizedInvocation tree needed for
 * inter-contract call authorization.
 */
function buildSubInvocation(
  auth: SubContractAuth
): xdr.SorobanAuthorizedInvocation {
  const contractAddress = new Address(auth.contractId);

  const subInvocations = (auth.subInvocations ?? []).map(buildSubInvocation);

  return new xdr.SorobanAuthorizedInvocation({
    function:
      xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
        new xdr.InvokeContractArgs({
          contractAddress: contractAddress.toScAddress(),
          functionName: auth.functionName,
          args: auth.args,
        })
      ),
    subInvocations,
  });
}

/**
 * Constructs SorobanAuthorizationEntry objects from SubContractAuth descriptors.
 * These entries are included in the transaction to authorize inter-contract calls.
 */
function buildAuthEntries(
  subAuths: SubContractAuth[]
): xdr.SorobanAuthorizationEntry[] {
  return subAuths.map((auth) => {
    const rootInvocation = buildSubInvocation(auth);

    return new xdr.SorobanAuthorizationEntry({
      credentials:
        xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),
      rootInvocation,
    });
  });
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Deploys a pre-compiled WASM binary to the Stellar testnet.
 *
 * This is a two-step process:
 * 1. Upload the WASM bytecode to the network
 * 2. Instantiate a contract from the uploaded WASM hash
 *
 * @param wasmBuffer - The compiled WASM binary to deploy.
 * @param deployerSecret - The deployer's Stellar secret key for signing.
 * @returns The deployed contract ID and the instantiation transaction hash.
 * @throws Error if the deployment transaction is rejected by the network.
 *
 * @see Requirement 4.1 (accept WASM binary, deploy via Soroban RPC)
 * @see Requirement 4.2 (return contract ID and transaction hash)
 * @see Requirement 4.3 (sign with deployer keypair)
 * @see Requirement 4.4 (descriptive error on rejection)
 */
export async function deployContract(
  wasmBuffer: Buffer,
  deployerSecret: string
): Promise<{ contractId: string; transactionHash: string }> {
  const server = getSorobanServer();
  const networkPassphrase = getNetworkPassphrase();
  const deployerKeypair = Keypair.fromSecret(deployerSecret);
  const deployerPublic = deployerKeypair.publicKey();

  // Step 1: Upload the WASM bytecode
  const account = await server.getAccount(deployerPublic);

  const uploadTx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(Operation.uploadContractWasm({ wasm: wasmBuffer }))
    .setTimeout(TX_TIMEOUT_SECONDS)
    .build();

  const preparedUpload = await server.prepareTransaction(uploadTx);
  preparedUpload.sign(deployerKeypair);

  const uploadResult = await server.sendTransaction(preparedUpload);

  if (uploadResult.status === 'ERROR') {
    const errorDetail = uploadResult.errorResult
      ? uploadResult.errorResult.toXDR('base64')
      : 'unknown';
    throw new Error(
      `Contract WASM upload rejected by network: ${errorDetail}`
    );
  }

  // Poll for upload completion
  const uploadTxResponse = await server.pollTransaction(uploadResult.hash, {
    attempts: POLL_MAX_ATTEMPTS,
  });

  if (uploadTxResponse.status !== 'SUCCESS') {
    const diagnostics =
      'diagnosticEventsXdr' in uploadTxResponse &&
      uploadTxResponse.diagnosticEventsXdr
        ? uploadTxResponse.diagnosticEventsXdr
            .map((e) => e.toXDR('base64'))
            .join(', ')
        : 'no diagnostics';
    throw new Error(
      `Contract WASM upload failed with status ${uploadTxResponse.status}: ${diagnostics}`
    );
  }

  // Extract the WASM hash from the upload result
  if (!uploadTxResponse.returnValue) {
    throw new Error(
      'Contract WASM upload succeeded but no return value (WASM hash) was returned'
    );
  }
  const wasmHash = uploadTxResponse.returnValue.bytes();

  // Step 2: Instantiate the contract from the uploaded WASM hash
  const freshAccount = await server.getAccount(deployerPublic);
  const deployerAddress = new Address(deployerPublic);

  const createTx = new TransactionBuilder(freshAccount, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      Operation.createCustomContract({
        address: deployerAddress,
        wasmHash: Buffer.from(wasmHash),
      })
    )
    .setTimeout(TX_TIMEOUT_SECONDS)
    .build();

  const preparedCreate = await server.prepareTransaction(createTx);
  preparedCreate.sign(deployerKeypair);

  const createResult = await server.sendTransaction(preparedCreate);

  if (createResult.status === 'ERROR') {
    const errorDetail = createResult.errorResult
      ? createResult.errorResult.toXDR('base64')
      : 'unknown';
    throw new Error(
      `Contract instantiation rejected by network: ${errorDetail}`
    );
  }

  // Poll for instantiation completion
  const createTxResponse = await server.pollTransaction(createResult.hash, {
    attempts: POLL_MAX_ATTEMPTS,
  });

  if (createTxResponse.status !== 'SUCCESS') {
    const diagnostics =
      'diagnosticEventsXdr' in createTxResponse &&
      createTxResponse.diagnosticEventsXdr
        ? createTxResponse.diagnosticEventsXdr
            .map((e) => e.toXDR('base64'))
            .join(', ')
        : 'no diagnostics';
    throw new Error(
      `Contract instantiation failed with status ${createTxResponse.status}: ${diagnostics}`
    );
  }

  // Extract the contract ID from the return value
  if (!createTxResponse.returnValue) {
    throw new Error(
      'Contract instantiation succeeded but no return value (contract address) was returned'
    );
  }

  const contractAddress = Address.fromScVal(createTxResponse.returnValue);
  const contractId = contractAddress.toString();

  return {
    contractId,
    transactionHash: createResult.hash,
  };
}

/**
 * Invokes a contract function (state-changing, submits transaction).
 *
 * Builds a Soroban transaction that calls the specified function on the target
 * contract, signs it with the caller's keypair, and submits it to the network.
 *
 * For inter-contract calls, the `subAuth` parameter allows specifying
 * sub-contract authorization entries that get included in the transaction.
 *
 * @param contractId - The Soroban contract ID (C... address).
 * @param functionName - The contract function to invoke.
 * @param args - The function arguments as XDR ScVal values.
 * @param callerSecret - The caller's Stellar secret key for signing.
 * @param subAuth - Optional sub-contract authorization entries for inter-contract calls.
 * @returns The transaction hash and the decoded return value.
 * @throws Error if the invocation fails with on-chain error codes.
 *
 * @see Requirement 5.1 (construct Soroban transaction with function and args)
 * @see Requirement 5.2 (return transaction hash and decoded return value)
 * @see Requirement 5.4 (return error code and diagnostic on failure)
 * @see Requirement 5.5 (XDR serialization/deserialization)
 * @see Requirement 6.1 (include both contracts in footprint)
 * @see Requirement 6.2 (sub-contract authorizations in envelope)
 * @see Requirement 6.3 (return combined result)
 * @see Requirement 6.4 (identify missing sub-contract authorization)
 */
export async function invokeContract(
  contractId: string,
  functionName: string,
  args: xdr.ScVal[],
  callerSecret: string,
  subAuth?: SubContractAuth[]
): Promise<{ transactionHash: string; returnValue: xdr.ScVal }> {
  const server = getSorobanServer();
  const networkPassphrase = getNetworkPassphrase();
  const callerKeypair = Keypair.fromSecret(callerSecret);
  const callerPublic = callerKeypair.publicKey();

  const account = await server.getAccount(callerPublic);
  const contract = new Contract(contractId);

  // Build the invocation transaction
  const txBuilder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(contract.call(functionName, ...args))
    .setTimeout(TX_TIMEOUT_SECONDS);

  const tx = txBuilder.build();

  // Simulate first to get resource estimates and auth requirements
  const simulation = await server.simulateTransaction(tx);

  if (rpc.Api.isSimulationError(simulation)) {
    // Check for missing sub-contract authorization in the error
    const errorMsg = simulation.error;
    if (
      errorMsg.includes('auth') ||
      errorMsg.includes('authorization') ||
      errorMsg.includes('Auth')
    ) {
      const missingAuths = identifyMissingAuth(simulation);
      throw new Error(
        `Contract invocation failed due to missing authorization: ${errorMsg}. ` +
          `Missing sub-contract authorizations: ${missingAuths}`
      );
    }
    throw new Error(`Contract invocation simulation failed: ${errorMsg}`);
  }

  // Assemble the transaction with simulation results (footprint, auth, fees)
  const assembledTxBuilder = rpc.assembleTransaction(tx, simulation);
  const assembledTx = assembledTxBuilder.build();

  // If subAuth entries are provided, add them to the existing auth
  if (subAuth && subAuth.length > 0) {
    const authEntries = buildAuthEntries(subAuth);
    const ops = assembledTx.operations;
    if (ops.length > 0 && 'auth' in ops[0]) {
      const invokeOp = ops[0] as Operation.InvokeHostFunction;
      const existingAuth = invokeOp.auth ?? [];
      // We need to rebuild with combined auth — the assembled transaction
      // already has the simulation auth, we add sub-contract auth entries
      const combinedAuth = [...existingAuth, ...authEntries];

      // Rebuild the transaction with combined auth
      const freshAccount = await server.getAccount(callerPublic);
      const rebuiltTx = new TransactionBuilder(freshAccount, {
        fee: BASE_FEE,
        networkPassphrase,
      })
        .addOperation(
          Operation.invokeHostFunction({
            func: invokeOp.func,
            auth: combinedAuth,
          })
        )
        .setTimeout(TX_TIMEOUT_SECONDS)
        .build();

      const rePrepared = await server.prepareTransaction(rebuiltTx);
      rePrepared.sign(callerKeypair);

      const sendResult = await server.sendTransaction(rePrepared);
      return handleInvocationResult(server, sendResult);
    }
  }

  // Sign and submit the assembled transaction
  assembledTx.sign(callerKeypair);

  const sendResult = await server.sendTransaction(assembledTx);
  return handleInvocationResult(server, sendResult);
}

/**
 * Simulates a contract call (read-only, no transaction submitted).
 *
 * Uses the Soroban RPC `simulateTransaction` to execute the contract function
 * without submitting a transaction to the ledger. Useful for querying contract
 * state (e.g. token balances).
 *
 * @param contractId - The Soroban contract ID (C... address).
 * @param functionName - The contract function to simulate.
 * @param args - The function arguments as XDR ScVal values.
 * @returns The decoded return value from the simulation.
 * @throws Error if the simulation fails.
 *
 * @see Requirement 5.3 (read-only calls via simulation)
 * @see Requirement 5.5 (XDR serialization/deserialization)
 */
export async function simulateContract(
  contractId: string,
  functionName: string,
  args: xdr.ScVal[]
): Promise<{ returnValue: xdr.ScVal }> {
  const server = getSorobanServer();
  const networkPassphrase = getNetworkPassphrase();

  const contract = new Contract(contractId);

  // We need a source account for the simulation transaction.
  // Use a dummy keypair since the transaction won't be submitted.
  const dummyKeypair = Keypair.random();
  const dummyAccount = new Account(dummyKeypair.publicKey(), '0');

  const tx = new TransactionBuilder(dummyAccount, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(contract.call(functionName, ...args))
    .setTimeout(TX_TIMEOUT_SECONDS)
    .build();

  const simulation = await server.simulateTransaction(tx);

  if (rpc.Api.isSimulationError(simulation)) {
    throw new Error(
      `Contract simulation failed: ${simulation.error}`
    );
  }

  if (!simulation.result || !simulation.result.retval) {
    throw new Error(
      'Contract simulation succeeded but no return value was produced'
    );
  }

  return {
    returnValue: simulation.result.retval,
  };
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Handles the result of a contract invocation transaction submission.
 * Polls for completion and extracts the return value.
 */
async function handleInvocationResult(
  server: rpc.Server,
  sendResult: rpc.Api.SendTransactionResponse
): Promise<{ transactionHash: string; returnValue: xdr.ScVal }> {
  if (sendResult.status === 'ERROR') {
    const errorDetail = sendResult.errorResult
      ? sendResult.errorResult.toXDR('base64')
      : 'unknown';
    const diagnosticDetail =
      sendResult.diagnosticEvents
        ?.map((e) => e.toXDR('base64'))
        .join(', ') ?? 'no diagnostics';
    throw new Error(
      `Contract invocation rejected by network: ${errorDetail}. Diagnostics: ${diagnosticDetail}`
    );
  }

  // Poll for transaction completion
  const txResponse = await server.pollTransaction(sendResult.hash, {
    attempts: POLL_MAX_ATTEMPTS,
  });

  if (txResponse.status === 'FAILED') {
    const diagnostics =
      'diagnosticEventsXdr' in txResponse && txResponse.diagnosticEventsXdr
        ? txResponse.diagnosticEventsXdr
            .map((e) => e.toXDR('base64'))
            .join(', ')
        : 'no diagnostics';
    throw new Error(
      `Contract invocation failed on-chain with status ${txResponse.status}. ` +
        `Diagnostics: ${diagnostics}`
    );
  }

  if (txResponse.status !== 'SUCCESS') {
    throw new Error(
      `Contract invocation ended with unexpected status: ${txResponse.status}`
    );
  }

  const returnValue =
    txResponse.returnValue ?? xdr.ScVal.scvVoid();

  return {
    transactionHash: sendResult.hash,
    returnValue,
  };
}

/**
 * Attempts to identify which sub-contract authorizations are missing
 * from a failed simulation response by inspecting diagnostic events.
 */
function identifyMissingAuth(
  simulation: rpc.Api.SimulateTransactionErrorResponse
): string {
  if (simulation.events && simulation.events.length > 0) {
    const authEvents = simulation.events
      .map((event) => {
        try {
          return event.toXDR('base64');
        } catch {
          return 'unparseable event';
        }
      })
      .join('; ');
    return authEvents || 'unable to determine missing authorizations';
  }
  return 'unable to determine missing authorizations from simulation response';
}

// Re-export XDR helpers for convenience
export { nativeToScVal, scValToNative, xdr };
