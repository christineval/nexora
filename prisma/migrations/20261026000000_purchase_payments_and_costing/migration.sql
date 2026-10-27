-- Establish a prospective opening valuation from the stored cost. Review this
-- baseline before deployment; historical costs and payments are not reconstructed.
BEGIN;
ALTER TABLE products ADD COLUMN inventory_value NUMERIC(24,2) NOT NULL DEFAULT 0;
UPDATE products SET inventory_value = stock_qty::numeric * unit_cost;
ALTER TABLE products ADD CONSTRAINT products_inventory_value_check CHECK (inventory_value >= 0 AND (stock_qty <> 0 OR inventory_value = 0));
ALTER TABLE inventory_movements ADD COLUMN cost_amount NUMERIC(24,2);
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movement_cost_check CHECK (cost_amount >= 0);

CREATE TABLE purchase_payments (
  id BIGSERIAL PRIMARY KEY,
  purchase_order_id BIGINT NOT NULL REFERENCES purchase_orders(id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  payment_key UUID NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL,
  reference VARCHAR(150),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX purchase_payments_created_by_payment_key_key ON purchase_payments(created_by, payment_key);
CREATE INDEX purchase_payments_purchase_order_id_payment_date_idx ON purchase_payments(purchase_order_id, payment_date);

CREATE FUNCTION protect_purchase_payments() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Purchase payments are append-only. Record a reviewed reversal instead.';
END;
$$;
CREATE TRIGGER purchase_payments_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON purchase_payments
FOR EACH STATEMENT EXECUTE FUNCTION protect_purchase_payments();
COMMIT;
