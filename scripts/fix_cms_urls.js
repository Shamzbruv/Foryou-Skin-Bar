require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fix() {
  console.log("Fixing home_hero image URL...");
  
  // Get home_hero
  const { data: homeData, error: homeError } = await db.from('site_content').select('*').eq('key', 'home_hero').single();
  if (homeData && homeData.value) {
    let val = homeData.value;
    val.image_url = 'assets/hero/natural_glow_skincare_hero_banner.png';
    await db.from('site_content').update({ value: val }).eq('key', 'home_hero');
    console.log("Updated home_hero image URL to assets/hero/natural_glow_skincare_hero_banner.png");
  } else {
    console.log("home_hero not found or error:", homeError);
  }

  // Get about_us
  const { data: aboutData, error: aboutError } = await db.from('site_content').select('*').eq('key', 'about_us').single();
  if (aboutData && aboutData.value) {
    let val = aboutData.value;
    val.image_url = 'assets/brand/about-hero.png';
    await db.from('site_content').update({ value: val }).eq('key', 'about_us');
    console.log("Updated about_us image URL to assets/brand/about-hero.png");
  } else {
    console.log("about_us not found or error:", aboutError);
  }
}

fix();
