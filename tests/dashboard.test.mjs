import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTs } from "./load-ts.mjs";

test("dashboard recent orders are bounded, include existing statuses and preserve completed-only totals", async () => {
  let recentQueries = 0;
  const tx = {
    products: { async count() { return 10; } },
    orders: { async findMany(query) {
      if (query.where.status) {
        assert.equal(query.where.status, "COMPLETED");
        return [{ order_date: new Date("2026-10-10T00:00:00Z"), total_amount: new Prisma.Decimal("0.30") }];
      }
      recentQueries++;
      assert.equal(query.take, 4);
      assert.equal(JSON.stringify(query.orderBy), JSON.stringify([{ order_date: "desc" }, { id: "desc" }]));
      assert.equal(JSON.stringify(query.select), JSON.stringify({ id: true, total_amount: true, status: true, customers: { select: { name: true } } }));
      return ["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED"].map((status, index) => ({ id: BigInt(index + 1), customers: { name: "Customer " + index }, total_amount: new Prisma.Decimal("12.50"), status }));
    } },
    purchase_orders: { async findMany(query) {
      assert.equal(query.where.status, "RECEIVED");
      return [];
    } },
  };
  const prisma = { async $transaction(operation, options) {
    assert.equal(options.isolationLevel, "RepeatableRead");
    assert.equal(options.maxWait, 10000);
    assert.equal(options.timeout, 30000);
    return operation(tx);
  } };
  const { getDashboardMetrics } = loadTs("src/services/dashboard.service.ts", { "@/lib/prisma": { prisma } });
  const metrics = await getDashboardMetrics({ id: 1n, name: "Admin", role: "ADMIN" }, { includeRecentOrders: true });
  assert.equal(metrics.recentOrders.length, 4);
  assert.equal(metrics.recentOrders[0].id, "1");
  assert.equal(metrics.recentOrders[0].status, "PENDING");
  assert.equal(metrics.recentOrders[0].totalAmount, 12.5);
  assert.equal(metrics.totalSales, 0.3);
  assert.equal(metrics.transactions.length, 1);
  const restricted = await getDashboardMetrics({ id: 1n, name: "Admin", role: "ADMIN" });
  assert.equal(restricted.recentOrders.length, 0);
  assert.equal(recentQueries, 1);
});

test("recent orders render business references, customer names, real statuses and an empty state", () => {
  const { default: RecentOrders } = loadTs("src/components/dashboard/RecentOrders.tsx");
  const html = renderToStaticMarkup(createElement(RecentOrders, { orders: [{ id: "25", customer: "ABC Trading", totalAmount: 12500, status: "COMPLETED" }] }));
  assert.match(html, /Recent Orders/);
  assert.match(html, /href="\/sales"/);
  assert.match(html, /href="\/sales\/25"/);
  assert.match(html, /ABC Trading/);
  assert.match(html, /12,500\.00/);
  assert.match(html, /COMPLETED/);
  assert.doesNotMatch(html, /Delivered/);
  const empty = renderToStaticMarkup(createElement(RecentOrders, { orders: [] }));
  assert.match(empty, /No sales orders yet\./);
});
