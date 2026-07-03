-- Add default shipping address columns to customers table
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS default_country text DEFAULT 'Jamaica',
ADD COLUMN IF NOT EXISTS default_address_line1 text,
ADD COLUMN IF NOT EXISTS default_address_line2 text,
ADD COLUMN IF NOT EXISTS default_city text,
ADD COLUMN IF NOT EXISTS default_parish text,
ADD COLUMN IF NOT EXISTS default_state_province text,
ADD COLUMN IF NOT EXISTS default_postal_code text;
