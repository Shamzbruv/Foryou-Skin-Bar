insert into public.site_content (key, value, updated_at)
values (
  'social_sharing',
  jsonb_build_object(
    'title', 'Foryou Skin Bar | Jamaican Handmade Skincare',
    'description', 'Handcrafted Jamaican skincare made for acne, dark spots, body care, and healthy glow routines.',
    'image_url', 'assets/brand/welcome-lifestyle-clean-branded-v2.png'
  ),
  now()
)
on conflict (key) do nothing;

notify pgrst, 'reload schema';
