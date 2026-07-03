-- Trigger function to add points to customer when order is paid
CREATE OR REPLACE FUNCTION handle_order_points()
RETURNS TRIGGER AS $$
BEGIN
    -- If the order payment status changes to 'paid'
    IF NEW.payment_status = 'paid' AND OLD.payment_status IS DISTINCT FROM 'paid' THEN
        IF NEW.customer_id IS NOT NULL AND COALESCE(NEW.points_earned, 0) > 0 THEN
            UPDATE customers
            SET loyalty_points_balance = COALESCE(loyalty_points_balance, 0) + NEW.points_earned,
                lifetime_earned_points = COALESCE(lifetime_earned_points, 0) + NEW.points_earned
            WHERE id = NEW.customer_id;
        END IF;
    -- If the order payment status changes FROM 'paid' to something else (e.g. refunded/cancelled)
    ELSIF OLD.payment_status = 'paid' AND NEW.payment_status IS DISTINCT FROM 'paid' THEN
        IF NEW.customer_id IS NOT NULL AND COALESCE(NEW.points_earned, 0) > 0 THEN
            UPDATE customers
            SET loyalty_points_balance = GREATEST(0, COALESCE(loyalty_points_balance, 0) - NEW.points_earned),
                lifetime_earned_points = GREATEST(0, COALESCE(lifetime_earned_points, 0) - NEW.points_earned)
            WHERE id = NEW.customer_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists to allow re-running
DROP TRIGGER IF EXISTS on_order_payment_status_change ON orders;

CREATE TRIGGER on_order_payment_status_change
AFTER UPDATE OF payment_status ON orders
FOR EACH ROW
EXECUTE FUNCTION handle_order_points();
