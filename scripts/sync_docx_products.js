const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function parseDocxText(xmlPath) {
    if (!fs.existsSync(xmlPath)) return null;
    const xml = fs.readFileSync(xmlPath, 'utf8');
    const paragraphs = xml.match(/<w:p[\s>].*?<\/w:p>/g);
    if (!paragraphs) return '';
    return paragraphs.map(p => {
        const textNodes = p.match(/<w:t[^>]*>(.*?)<\/w:t>/g);
        if (textNodes) return textNodes.map(t => t.replace(/<[^>]+>/g, '')).join('').replace(/&amp;/g, '&');
        return '';
    }).filter(p => p.trim() !== '').join('\n');
}

function extractSection(text, startHeader, endHeaders) {
    const lines = text.split('\n');
    let startIndex = -1;
    let endIndex = -1;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim().toLowerCase();
        if (startIndex === -1 && line.includes(startHeader.toLowerCase())) {
            startIndex = i + 1;
            continue;
        }
        if (startIndex !== -1 && endIndex === -1) {
            for (const endHeader of endHeaders) {
                if (line.includes(endHeader.toLowerCase()) && line.length < 30) {
                    endIndex = i;
                    break;
                }
            }
        }
    }
    
    if (startIndex !== -1) {
        if (endIndex === -1) endIndex = lines.length;
        return lines.slice(startIndex, endIndex).map(l => l.trim()).filter(Boolean).join('<br>\n');
    }
    return null;
}

function extractDescription(text) {
    const lines = text.split('\n');
    let endIndex = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes('key benefits')) {
            endIndex = i;
            break;
        }
    }
    if (endIndex !== -1) {
        return lines.slice(1, endIndex).map(l => l.trim()).filter(Boolean).join('\n\n');
    }
    return '';
}

function extractSize(text) {
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes('size') && lines[i].length < 10) {
            if (i + 1 < lines.length) return lines[i+1].trim();
        }
    }
    return null;
}

const products = [
    {
        name: 'Clear Skin Serum',
        xmlPath: '../../Clear_Skin_Serum_Extracted/word/document.xml'
    },
    {
        name: 'Skin Balance',
        xmlPath: '../../Skin_Balance_Toner_Extracted/word/document.xml'
    },
    {
        name: 'Skinfidence Blemish Cream',
        xmlPath: '../../Skinfidence_Blemish_Cream_Extracted/word/document.xml'
    }
];

async function syncProducts() {
    for (const prod of products) {
        const xmlPath = path.join(__dirname, prod.xmlPath);
        const text = parseDocxText(xmlPath);
        
        if (!text) {
            console.error(`Could not read text for ${prod.name}`);
            continue;
        }
        
        const description = extractDescription(text);
        const benefits = extractSection(text, 'Key Benefits', ['Why You', 'How to Use', 'Expected Results', 'Suitable For', 'Size']);
        const ingredients = extractSection(text, 'Why You', ['How to Use', 'Expected Results', 'Suitable For', 'Size']);
        const howToUse = extractSection(text, 'How to Use', ['Expected Results', 'Suitable For', 'Size', 'Complete Your Routine']);
        const suitableFor = extractSection(text, 'Suitable For', ['Size', 'Complete Your Routine']);
        const size = extractSize(text);
        
        const updateData = {};
        if (description) updateData.description = description;
        if (benefits) updateData.results_html = benefits;
        if (ingredients) updateData.ingredients_html = ingredients;
        if (howToUse) updateData.how_to_use_html = howToUse;
        if (suitableFor) updateData.best_for = suitableFor.replace(/<br>\n/g, ', ');
        if (size) updateData.size = size;

        console.log(`\n--- Updating ${prod.name} ---`);
        console.log(updateData);
        
        // Find product in DB
        const { data: dbProds, error: searchErr } = await supabase
            .from('products')
            .select('id, name')
            .ilike('name', `%${prod.name}%`);
            
        if (searchErr || !dbProds || dbProds.length === 0) {
            console.log(`Product "${prod.name}" not found in database. Skipping DB update.`);
            continue;
        }
        
        const { error: updateErr } = await supabase
            .from('products')
            .update(updateData)
            .eq('id', dbProds[0].id);
            
        if (updateErr) {
            console.error(`Failed to update ${prod.name}:`, updateErr);
        } else {
            console.log(`Successfully updated ${prod.name} in Supabase!`);
        }
    }
}

syncProducts().catch(console.error);
