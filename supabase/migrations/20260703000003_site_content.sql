-- Migration to add a site_content table for the CMS
CREATE TABLE IF NOT EXISTS public.site_content (
    key text PRIMARY KEY,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);

-- Seed initial data for index.html
INSERT INTO public.site_content (key, value)
VALUES (
    'home_hero',
    '{"title": "Jamaican Made Handcrafted Skincare", "subtitle": "Nourish your skin with our all-natural, botanical-infused body care collection.", "button_text": "Shop Now", "image_url": "assets/brand/banner.jpg"}'
) ON CONFLICT (key) DO NOTHING;

-- Seed initial data for about.html
INSERT INTO public.site_content (key, value)
VALUES (
    'about_us',
    '{"title": "About For You Skin Bar", "text1": "For You Skin Bar was born from a desire to create skincare that not only nourishes the skin but also uplifts the soul.", "text2": "Every product is carefully formulated using the finest natural ingredients, sourced directly from the earth. We believe in the power of botanical healing, blending traditional Jamaican remedies with modern skincare science to deliver results you can see and feel.", "image_url": "assets/brand/placeholder.jpg"}'
) ON CONFLICT (key) DO NOTHING;

-- Set up RLS to allow public read, but restrict writes
ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to site_content"
    ON public.site_content FOR SELECT
    USING (true);

-- Allow authenticated admins (using service_role in backend, or authenticated users in UI depending on setup)
-- Since they use Supabase anon key on the frontend for now, we will rely on admin check in the backend or just the API we build.
-- The current admin dashboard accesses Supabase directly using the anon key but requires a valid session.
CREATE POLICY "Allow authenticated updates to site_content"
    ON public.site_content FOR ALL
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');
