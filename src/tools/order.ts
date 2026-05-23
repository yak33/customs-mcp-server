/**
 * Tool definition for order draft pre-check (1 tool).
 *
 * @author ZHANGCHAO
 */

import { z } from "zod";

import { createOrderDraft, type GoodsLine } from "../api/order.js";
import { resolveIdentity, type IdentityOverride } from "../identity.js";
import {
  type ExecutionContext,
  type ToolDefinition,
  type ToolInput,
  withIdentity,
} from "./_common.js";

const GoodsLineSchema = z
  .object({
    pn: z.string().trim().optional().describe("Product name"),
    hsname: z
      .string()
      .trim()
      .optional()
      .describe("HS-classified description name"),
    qty: z.number().positive().describe("Quantity, must be > 0"),
    qunit: z.string().trim().optional().describe("Quantity unit code"),
    price: z.number().positive().optional().describe("Unit price"),
    amount: z.number().positive().optional().describe("Line total amount"),
    currency: z.string().trim().optional().describe("Currency code"),
  })
  .describe("A single goods line; either pn or hsname must be provided.");

export function orderCreateDraftTool(): ToolDefinition {
  return {
    name: "customs_create_order_draft",
    description:
      "PRE-CHECK ONLY: validate the payload and write an audit row. " +
      "Does NOT yet persist a new order on the backend — production " +
      "creation is gated behind a future `confirmCreate` step.",
    inputSchema: withIdentity({
      orderType: z
        .string()
        .trim()
        .min(1)
        .describe('Order type (e.g. "PROCURE" for procurement) — required'),
      ieFlag: z
        .enum(["I", "E"])
        .describe("Import (I) or Export (E) — required"),
      buyerName: z
        .string()
        .trim()
        .min(1)
        .describe("Buyer (consignee) legal name — required"),
      goodsLines: z
        .array(GoodsLineSchema)
        .min(1)
        .describe("Array of goods lines (≥ 1 row) — required"),
      currency: z.string().trim().optional().describe("Default currency"),
      totalAmount: z.number().nonnegative().optional().describe("Order total"),
      contractNo: z.string().trim().optional().describe("Contract number"),
      remark: z.string().trim().optional().describe("Free-form remark"),
    }),
    async handler(input: ToolInput, ctx: ExecutionContext) {
      const identity = resolveIdentity(
        input._identity as IdentityOverride,
        ctx.config.identity,
      );
      return createOrderDraft(ctx, identity, {
        orderType: input.orderType as string,
        ieFlag: input.ieFlag as "I" | "E",
        buyerName: input.buyerName as string,
        goodsLines: input.goodsLines as GoodsLine[],
        currency: input.currency as string | undefined,
        totalAmount: input.totalAmount as number | undefined,
        contractNo: input.contractNo as string | undefined,
        remark: input.remark as string | undefined,
      });
    },
  };
}
