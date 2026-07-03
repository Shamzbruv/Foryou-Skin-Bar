-- Add loyalty tracking columns to customers table
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS loyalty_points_balance INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS lifetime_earned_points INTEGER DEFAULT 0;

-- Add points_earned column to orders table
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS points_earned INTEGER DEFAULT 0;
