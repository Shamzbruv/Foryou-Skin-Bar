-- Four launch-week articles for the Foryou Skin Journal.
-- These are educational resources, not individualized medical advice.

insert into public.blog_posts (
  title, slug, excerpt, content, featured_image_url, status, published_at,
  seo_title, seo_description, primary_topic, article_type, is_new_this_week,
  reading_time_minutes, related_post_slugs
) values
(
  'The Difference Between Acne Scars and Hyperpigmentation',
  'difference-between-acne-scars-and-hyperpigmentation',
  'Not every mark left by acne is a scar. Learn how texture changes differ from post-inflammatory hyperpigmentation and why the distinction matters.',
  $article$
    <p>When a breakout clears, the mark it leaves behind can feel like a scar. But flat discoloration and a permanent change in skin texture are not the same thing. Knowing which one you are seeing helps you set realistic expectations and choose a safer next step.</p>
    <p>This distinction is especially useful for melanin-rich skin, where inflammation is more likely to leave a brown, deep-brown, or blue-grey mark after the acne itself has settled.</p>

    <h2>The quick difference</h2>
    <p><strong>Post-inflammatory hyperpigmentation (PIH)</strong> is a flat area of extra pigment. The surface of the skin usually feels the same as the skin around it. PIH can gradually fade, although the process may take months.</p>
    <p><strong>An acne scar</strong> changes the texture or structure of the skin. A scar may be indented, raised, firm, or uneven. The American Academy of Dermatology notes that the flat pigmented spots that appear after acne are generally not scars.</p>

    <h2>How to look at the mark</h2>
    <ul>
      <li><strong>Look from the front:</strong> Is the concern mostly a difference in colour?</li>
      <li><strong>Look from the side:</strong> Does light reveal a dip, pit, ridge, or raised area?</li>
      <li><strong>Gently feel the area:</strong> Does the texture feel level, or has the surface changed?</li>
    </ul>
    <p>A flat brown or grey mark is more consistent with PIH. A depression or raised area is more consistent with scarring. It is possible to have both in the same place, so an in-person assessment may be useful when the difference is not clear.</p>

    <h2>Why acne leaves dark marks</h2>
    <p>Inflammation can signal pigment-producing cells to make more melanin. Picking, squeezing, harsh scrubbing, and irritating products can add more inflammation and make the mark more noticeable. Treating active breakouts early and gently is therefore part of preventing new marks.</p>
    <p>Start with the Journal's <a href="blog-post.html?slug=complete-guide-to-acne">complete guide to acne</a>, then use the <a href="blog-post.html?slug=complete-guide-to-hyperpigmentation">hyperpigmentation foundation guide</a> to understand the pigment side of the concern.</p>

    <h2>What supports fading</h2>
    <p>Consistency matters more than adding many strong products at once. A practical routine usually focuses on gentle cleansing, a suitable targeted product, moisturizer, and daily sun protection. The AAD recommends broad-spectrum, water-resistant sunscreen with SPF 30 or higher; tinted formulas containing iron oxide can also help protect against visible light that may worsen dark spots.</p>
    <p>Introduce one active at a time and patch test it. If a product burns, stings, or creates persistent irritation, stop and reassess. Irritation can work against the goal of a more even-looking tone.</p>

    <h2>What scars may need</h2>
    <p>Skincare can support a healthy-looking surface, but established indented or raised scars often need a dermatologist's assessment. Treatment depends on the scar type, skin tone, medical history, and whether active acne is controlled. Avoid attempting aggressive at-home procedures on textured scars.</p>

    <h2>When to get professional help</h2>
    <p>See a qualified dermatologist if acne is painful, deep, leaving new scars, or not improving; if a raised area is growing; or if you are unsure whether a mark is pigment or a scar. Early treatment can reduce the chance of additional scarring.</p>

    <h2>Sources and further reading</h2>
    <ul>
      <li><a href="https://www.aad.org/public/diseases/acne/derm-treat/scars/symptoms" target="_blank" rel="noopener">American Academy of Dermatology: Acne scars, signs and symptoms</a></li>
      <li><a href="https://www.aad.org/public/diseases/acne/DIY/skin-color" target="_blank" rel="noopener">American Academy of Dermatology: Acne care for darker skin tones</a></li>
      <li><a href="https://www.aad.org/public/everyday-care/skin-care-secrets/routine/fade-dark-spots" target="_blank" rel="noopener">American Academy of Dermatology: How to fade dark spots in darker skin tones</a></li>
    </ul>
    <p><em>Foryou Skin Journal provides general skincare education and does not diagnose or treat medical conditions.</em></p>
  $article$,
  '/assets/home-concerns/dark-spots-black-woman.jpg',
  'published', '2026-08-08 08:00:00-05',
  'Acne Scars vs Hyperpigmentation | Foryou Skin Journal',
  'Learn how acne scars differ from post-inflammatory hyperpigmentation, how to recognize each, and when to seek professional care.',
  'dark-spots-hyperpigmentation', 'weekly', true, 7,
  array['complete-guide-to-acne', 'complete-guide-to-hyperpigmentation', 'how-long-does-it-take-to-fade-dark-spots']
),
(
  'How Long Does It Take to Fade Dark Spots?',
  'how-long-does-it-take-to-fade-dark-spots',
  'Dark spots rarely disappear overnight. Understand realistic fading timelines, what can slow progress, and the routine habits that support an even-looking tone.',
  $article$
    <p>Dark spots can be slow to change, even when your routine is well chosen. That does not always mean the routine has failed. Pigment sits at different depths, each person's skin responds differently, and new irritation can create new marks while older ones are fading.</p>

    <h2>A realistic starting point</h2>
    <p>According to the American Academy of Dermatology, a spot that is only a few shades darker than your natural skin tone may take about six to twelve months to fade after the cause is controlled. Pigment that sits deeper in the skin can take years. Treatment may speed fading, but no responsible routine can promise an exact date.</p>
    <p>The most useful question is not only “How fast?” but also “Have I stopped what is creating new pigment?” Acne, eczema, picking, friction, irritating formulas, and unprotected sun or visible-light exposure can keep the cycle going.</p>

    <h2>Four factors that affect the timeline</h2>
    <ol>
      <li><strong>Depth of pigment:</strong> Surface-level discoloration generally changes sooner than deeper blue-grey or very dark pigment.</li>
      <li><strong>Ongoing inflammation:</strong> New breakouts or irritation can create fresh marks.</li>
      <li><strong>Daily protection:</strong> Sun and visible light can darken existing areas and slow visible progress.</li>
      <li><strong>Routine tolerance:</strong> A consistent gentle routine is often more useful than an aggressive routine that repeatedly irritates the skin.</li>
    </ol>

    <h2>What steady progress can look like</h2>
    <p>Take a clear photo in the same lighting every four weeks instead of checking every day. Look for softer edges, less contrast, and fewer new marks. Daily mirror checks can make gradual change difficult to notice.</p>
    <p>Do not judge a new product after only a few applications unless it is causing irritation. Follow its directions, patch test first, and introduce one change at a time so you can tell what your skin tolerates.</p>

    <h2>A simple routine framework</h2>
    <ul>
      <li><strong>Cleanse:</strong> use a gentle cleanser without scrubbing the mark.</li>
      <li><strong>Treat:</strong> choose one targeted product appropriate for your skin and follow its directions.</li>
      <li><strong>Moisturize:</strong> support comfort and reduce the temptation to over-exfoliate dry areas.</li>
      <li><strong>Protect:</strong> use broad-spectrum SPF 30 or higher each morning; a tinted option with iron oxide may provide added visible-light protection for dark spots.</li>
    </ul>
    <p>For a fuller explanation of ingredients and routine structure, read the <a href="blog-post.html?slug=complete-guide-to-hyperpigmentation">complete guide to hyperpigmentation</a> and the <a href="blog-post.html?slug=complete-guide-to-skincare-routine">routine foundation guide</a>.</p>

    <h2>Common setbacks</h2>
    <p>Picking a breakout, using several exfoliants together, skipping moisturizer because skin is oily, and applying brightening products without daily sun protection can all work against progress. If a product causes burning, swelling, a rash, or persistent peeling, stop using it and seek advice.</p>

    <h2>When to see a dermatologist</h2>
    <p>Professional guidance is appropriate when spots are changing quickly, when the cause is uncertain, when acne or another inflammatory condition remains active, or when months of a consistent routine produce no improvement. Some pigment concerns need prescription care, and not every dark area is PIH.</p>

    <h2>Sources and further reading</h2>
    <ul>
      <li><a href="https://www.aad.org/public/everyday-care/skin-care-secrets/routine/fade-dark-spots" target="_blank" rel="noopener">American Academy of Dermatology: How to fade dark spots in darker skin tones</a></li>
      <li><a href="https://www.aad.org/public/everyday-care/sun-protection/shade-clothing-sunscreen/choosing-right-sunscreen" target="_blank" rel="noopener">American Academy of Dermatology: Choosing sunscreen</a></li>
      <li><a href="https://www.aad.org/public/diseases/acne/DIY/skin-color" target="_blank" rel="noopener">American Academy of Dermatology: Acne and dark spots in skin of color</a></li>
    </ul>
    <p><em>Foryou Skin Journal provides general skincare education and does not diagnose or treat medical conditions.</em></p>
  $article$,
  '/assets/home-concerns/dark-spots.jpg',
  'published', '2026-08-08 09:00:00-05',
  'How Long Do Dark Spots Take to Fade? | Foryou Skin Journal',
  'Learn realistic dark-spot fading timelines and the gentle routine, sun protection, and consistency that can support visible progress.',
  'dark-spots-hyperpigmentation', 'weekly', true, 7,
  array['complete-guide-to-hyperpigmentation', 'difference-between-acne-scars-and-hyperpigmentation', 'hyperpigmentation-mistakes-how-to-fix-them']
),
(
  'Can Stress Cause Acne?',
  'can-stress-cause-acne',
  'Stress does not tell the whole acne story, but it can make existing breakouts worse. Learn what the evidence says and how to support your skin during stressful weeks.',
  $article$
    <p>A stressful week and a sudden breakout can feel directly connected. The relationship is real, but it is more accurate to say that stress can worsen existing acne rather than acting as the only cause.</p>
    <p>Acne develops through a combination of clogged pores, oil production, inflammation, bacteria, hormones, genetics, and product or lifestyle factors. Stress can influence parts of that system, but it is rarely the whole explanation.</p>

    <h2>What happens when stress rises</h2>
    <p>The American Academy of Dermatology explains that stress can trigger hormonal changes that increase oil production. More oil can contribute to clogged pores and an acne flare. Stress can also affect sleep and daily habits, which may make a consistent routine harder to maintain.</p>
    <p>This is why the same person may notice more breakouts around examinations, deadlines, grief, travel, or long periods of poor sleep without stress being the original cause of their acne.</p>

    <h2>Stress-related patterns to notice</h2>
    <ul>
      <li>breakouts become more frequent during demanding weeks;</li>
      <li>sleep changes at the same time;</li>
      <li>you touch or pick your skin more often;</li>
      <li>your routine becomes inconsistent;</li>
      <li>you add harsh products in an attempt to clear the flare quickly.</li>
    </ul>
    <p>A simple skin diary can help. Note your sleep, stress level, menstrual cycle if relevant, product changes, and breakout location for six to eight weeks. Patterns are more useful than a single difficult day.</p>

    <h2>What to do during a flare</h2>
    <ol>
      <li><strong>Keep the routine simple.</strong> Continue gentle cleansing, one suitable acne treatment, moisturizer, and sun protection.</li>
      <li><strong>Avoid panic exfoliation.</strong> Scrubbing and stacking strong actives can add irritation and increase the chance of dark marks.</li>
      <li><strong>Protect sleep where possible.</strong> A regular wind-down routine can support overall wellbeing and make skincare consistency easier.</li>
      <li><strong>Keep hands away from blemishes.</strong> Picking can increase inflammation, discoloration, and scarring risk.</li>
      <li><strong>Use stress support that fits your life.</strong> Walking, breathing exercises, journaling, movement, and speaking with someone you trust can all be reasonable tools.</li>
    </ol>

    <h2>Skincare still needs to address acne</h2>
    <p>Managing stress can support your overall plan, but it does not replace acne treatment. Read the <a href="blog-post.html?slug=complete-guide-to-acne">complete guide to acne</a> for the different breakout types and routine options. If breakouts are concentrated around the lower face and follow a recurring cycle, the article on <a href="blog-post.html?slug=hormonal-acne-explained">hormonal acne</a> may also help you prepare questions for a dermatologist.</p>

    <h2>When professional support matters</h2>
    <p>See a dermatologist when acne is painful, deep, scarring, or persistent despite a consistent routine. Seek mental-health support when stress feels overwhelming or interferes with sleep, work, school, relationships, or daily functioning. Both concerns deserve appropriate care.</p>

    <h2>Sources and further reading</h2>
    <ul>
      <li><a href="https://www.aad.org/public/diseases/acne/causes/acne-causes" target="_blank" rel="noopener">American Academy of Dermatology: Acne causes and the role of stress</a></li>
      <li><a href="https://www.aad.org/public/diseases/acne/really-acne/adult-acne" target="_blank" rel="noopener">American Academy of Dermatology: Adult acne</a></li>
      <li><a href="https://www.aad.org/public/diseases/a-z/stress-skin-conditions" target="_blank" rel="noopener">American Academy of Dermatology: Skin conditions linked to stress</a></li>
    </ul>
    <p><em>Foryou Skin Journal provides general skincare education and does not diagnose or treat medical conditions.</em></p>
  $article$,
  '/assets/blog/blog_wellness.png',
  'published', '2026-08-08 10:00:00-05',
  'Can Stress Cause Acne? | Foryou Skin Journal',
  'Learn how stress may worsen acne, what patterns to watch, and how to keep a gentle, consistent routine during stressful periods.',
  'acne', 'weekly', true, 6,
  array['complete-guide-to-acne', 'why-acne-keeps-coming-back-how-to-stop-the-cycle', 'hormonal-acne-explained']
),
(
  'Hormonal Acne Explained',
  'hormonal-acne-explained',
  'Hormonal acne often follows recognizable patterns. Learn the common signs, why it happens, and when a dermatologist should be part of your plan.',
  $article$
    <p>Hormones influence oil glands and can contribute to acne at many life stages. Some people notice breakouts around puberty, menstrual cycles, pregnancy, perimenopause, menopause, or after starting or stopping certain medications. A recurring lower-face pattern is often described as hormonal acne, but location alone cannot confirm a diagnosis.</p>

    <h2>Common signs people notice</h2>
    <ul>
      <li>breakouts that return around the chin, jawline, or lower face;</li>
      <li>flares that follow a menstrual pattern;</li>
      <li>deep, tender bumps that take time to settle;</li>
      <li>adult acne that continues despite a consistent over-the-counter routine;</li>
      <li>breakouts that began after a hormonal change or medication change.</li>
    </ul>
    <p>Other conditions can look like acne, so it is important not to self-diagnose solely from a social-media checklist.</p>

    <h2>Why hormones can affect breakouts</h2>
    <p>Androgens can increase the size and activity of oil glands. Extra oil, together with dead skin cells and inflammation, can contribute to clogged pores. Genetics, stress, products, and other health factors may influence the same process.</p>
    <p>For a broader explanation of acne types and triggers, begin with the Journal's <a href="blog-post.html?slug=complete-guide-to-acne">acne foundation guide</a>.</p>

    <h2>What a supportive routine looks like</h2>
    <p>A skincare routine cannot control every hormonal trigger, but it can support the skin and help manage mild breakouts:</p>
    <ol>
      <li>Cleanse gently, usually no more than twice daily and after heavy sweating.</li>
      <li>Choose one evidence-based acne active that suits your skin and follow the label.</li>
      <li>Use a non-comedogenic moisturizer to support comfort.</li>
      <li>Apply broad-spectrum SPF 30 or higher every morning.</li>
      <li>Avoid picking, harsh scrubs, and frequent product switching.</li>
    </ol>
    <p>Patch test new products and give a suitable routine time to work. The AAD notes that acne treatments may take two to three months to show improvement.</p>

    <h2>When a dermatologist can help</h2>
    <p>Stubborn, deep, painful, or scarring acne deserves professional assessment. Dermatologists may discuss prescription topical treatments or, when appropriate, hormonal therapies. These medicines have risks and are not suitable for everyone, so they require individual medical screening and follow-up.</p>
    <p>Tell a clinician about pregnancy, plans for pregnancy, menstrual changes, new facial hair, scalp hair changes, medication use, and other health symptoms. Those details can affect the safest plan.</p>

    <h2>Questions to take to an appointment</h2>
    <ul>
      <li>Does this pattern look hormonal or could it be another condition?</li>
      <li>Which treatment is appropriate for my skin tone and medical history?</li>
      <li>How should I combine prescriptions with my current routine?</li>
      <li>Which side effects mean I should stop or contact the clinic?</li>
      <li>How can I reduce new dark marks while treating active acne?</li>
    </ul>

    <h2>Sources and further reading</h2>
    <ul>
      <li><a href="https://www.aad.org/public/diseases/acne/derm-treat/treat" target="_blank" rel="noopener">American Academy of Dermatology: Acne diagnosis and treatment</a></li>
      <li><a href="https://www.aad.org/public/diseases/acne/derm-treat/hormonal-therapy" target="_blank" rel="noopener">American Academy of Dermatology: Hormonal therapy for stubborn acne</a></li>
      <li><a href="https://www.aad.org/public/diseases/acne/really-acne/adult-acne" target="_blank" rel="noopener">American Academy of Dermatology: Adult acne causes</a></li>
    </ul>
    <p><em>Foryou Skin Journal provides general skincare education and does not diagnose or treat medical conditions.</em></p>
  $article$,
  '/assets/home-concerns/acne-breakouts-black-woman.jpg',
  'published', '2026-08-08 11:00:00-05',
  'Hormonal Acne Explained | Foryou Skin Journal',
  'Understand common hormonal acne patterns, supportive skincare habits, and when to ask a dermatologist about treatment options.',
  'acne', 'weekly', true, 7,
  array['complete-guide-to-acne', 'can-stress-cause-acne', 'why-acne-keeps-coming-back-how-to-stop-the-cycle']
)
on conflict (slug) do update set
  title = excluded.title,
  excerpt = excluded.excerpt,
  content = excluded.content,
  featured_image_url = excluded.featured_image_url,
  status = excluded.status,
  published_at = excluded.published_at,
  seo_title = excluded.seo_title,
  seo_description = excluded.seo_description,
  primary_topic = excluded.primary_topic,
  article_type = excluded.article_type,
  is_new_this_week = excluded.is_new_this_week,
  reading_time_minutes = excluded.reading_time_minutes,
  related_post_slugs = excluded.related_post_slugs,
  updated_at = now();
