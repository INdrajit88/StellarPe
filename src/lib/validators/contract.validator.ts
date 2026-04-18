import { z } from 'zod';

/**
 * Sub-contract authorization entry for inter-contract calls.
 * Used when a contract invocation triggers calls to other contracts
 * that require separate authorization.
 */
const subContractAuthSchema = z.object({
  contractId: z.string().min(1, 'Sub-contract ID is required'),
  functionName: z.string().min(1, 'Sub-contract function name is required'),
  args: z.array(z.unknown()).default([]),
});

/**
 * Deploy contract request validation schema.
 * Accepts a base64-encoded WASM binary and optional constructor arguments.
 * Requirements: 5.5
 */
export const deployContractSchema = z.object({
  wasmBase64: z.string().min(1, 'WASM base64 binary is required'),
  constructorArgs: z.array(z.unknown()).optional(),
});

/**
 * Invoke contract function request validation schema.
 * Requires a contract ID, function name, and arguments array.
 * Optionally accepts sub-contract authorization entries for inter-contract calls.
 * Requirements: 5.5, 6.5
 */
export const invokeContractSchema = z.object({
  contractId: z.string().min(1, 'Contract ID is required'),
  functionName: z.string().min(1, 'Function name is required'),
  args: z.array(z.unknown()),
  subAuth: z.array(subContractAuthSchema).optional(),
});

/**
 * Simulate contract call request validation schema.
 * Read-only call — requires contract ID, function name, and arguments.
 * Requirements: 5.5
 */
export const simulateContractSchema = z.object({
  contractId: z.string().min(1, 'Contract ID is required'),
  functionName: z.string().min(1, 'Function name is required'),
  args: z.array(z.unknown()),
});

export type DeployContractInput = z.infer<typeof deployContractSchema>;
export type InvokeContractInput = z.infer<typeof invokeContractSchema>;
export type SimulateContractInput = z.infer<typeof simulateContractSchema>;
