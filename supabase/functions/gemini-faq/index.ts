// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8"

// ⚠️ DEBUGGING: Paste your key inside the quotes below
const HARDCODED_KEY = "AIzaSyDzr7F9YgXcCO2uryRcU5a_2xN7PQ5TwUo";

const FAQ_CONTENT = `
# Wedding FAQs & Information

Category: 👶 Children & Plus-Ones
Q: Are kids allowed?
A: We have decided to not have children at the wedding due to the nature of the venue and activities.

Q: Can we bring our children?
A: We have decided to not have children at the wedding due to the nature of the venue and activities.

Q: Is babysitting or a crèche available at the venue?
A: No, babysitting or crèche services are not provided.

Q: Can I bring a plus-one?
A: Please do not bring a plus-one; only guests named on the invitations are invited.

Category: 👗 Dress Code
Q: What colour are the bridesmaids wearing?
A: The bridesmaids will be in sage green.

Q: What is the dress code for Day 1?
A: Summer cocktail party. Feel free to wear dresses, skirts, shorts, shirt/polo, T-shirt or jeans. Trainers are fine.

Q: What is the dress code for Day 2?
A: Garden party. Florals, sandals, shorts, polos, and T-shirts are all great. Trainers are fine for outdoor games.

Q: What is the dress code for Day 3?
A: Wedding day attire! Typical summer wedding. Ties are optional, but please skip jeans, shorts, and trainers.

Category: 📍 Logistics
Q: What is the exact address of the venue?
A: Huntsham Court, Huntsham, Tiverton EX16 7NA.

Q: Is there parking available on-site, and is it free?
A: Yes, there is plenty of parking available free of charge.
`;

// @ts-ignore
serve(async (req: any) => {
    // 1. CORS Setup
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    }

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // 2. Get Request Data
        const { query, guest, roomDetails, itinerary, lastBotReply } = await req.json()
        if (!query) {
            throw new Error('No query provided')
        }

        // 2.5. Fetch FAQs from Database
        const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://jkxxswxpykdyrpjriizx.supabase.co';
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpreHhzd3hweWtkeXJwanJpaXp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4NzUzMTYsImV4cCI6MjA4MTQ1MTMxNn0.mu--najU_Urrt-5jAfEhPGdg6rYCrsDo_fj01BJ5abc';
        const supabaseClient = createClient(supabaseUrl, supabaseKey, {
            global: {
                headers: {
                    'x-access-code': 'HPRT0730'
                }
            }
        });
        
        let faqContent = "";
        try {
            const { data: faqRows, error: faqErr } = await supabaseClient
                .from('faqs')
                .select('category, question, answer')
                .order('display_order', { ascending: true });
            
            if (faqErr) throw faqErr;

            if (faqRows && faqRows.length > 0) {
                faqContent = faqRows.map(f => {
                    return `Category: ${f.category}\nQ: ${f.question}\nA: ${f.answer}\n`;
                }).join('\n');
            } else {
                faqContent = FAQ_CONTENT;
            }
        } catch (dbErr) {
            console.error("Database FAQ fetch error, falling back to hardcoded:", dbErr);
            faqContent = FAQ_CONTENT;
        }

        // 3. Get API Key
        // Priority: Hardcoded -> Secret
        // @ts-ignore
        const apiKey = HARDCODED_KEY || Deno.env.get('GEMINI_API_KEY');
        if (!apiKey) {
            throw new Error('API Key is missing! Set GEMINI_API_KEY secret or paste into HARDCODED_KEY.')
        }

        // 4. Construct Prompt
        const systemPrompt = `
You are a warm, helpful, and elegant Wedding Assistant AI for Harry & Rosh's wedding.
Your tone must be friendly, clear, and extremely concise.

CRITICAL BREVITY RULES:
- Answer the user's question directly in the minimum possible words (1-2 short sentences).
- Absolutely NO conversational filler, greetings, or friendly transitions.
- Do NOT say: "Hi there!", "Hey there!", "That's a great question!", "I'd love to tell you", "I hope this helps!", "Let me know if you need anything else", or any other conversational fluff.
- Just answer the question directly, politely, and cleanly.

CRITICAL DASHBOARD LINKING RULES:
If the user asks about their room, the itinerary/agenda, the estate/map, the photo gallery, or updating their RSVP, you must append a specific link at the end of your response in the format [Link Text](action://target).
Targets:
- Their room assignment/details: append [See room info](action://room) (ONLY if Room Revealed Yet is Yes)
- The wedding schedule/timeline: append [See plan](action://itinerary)
- The estate maps/directions: append [Explore estate](action://estate)
- The photo gallery: append [View gallery](action://gallery)
- Updating RSVP details: append [Update RSVP](action://rsvp)

Example:
User: "Which room am I in?"
Response: "You are staying in the Huntsham Suite. [See room info](action://room)"

CRITICAL ROOM REVEAL RULE:
- If "Room Revealed Yet" is "No", you MUST NOT mention their assigned room name (even if listed in context), pricing, or roommate info. If they ask about their room details, price, or booking status, politely tell them that room allocations are currently being finalized by Rosh & Harry and will be revealed in the coming months.
- If "Room Revealed Yet" is "No", do NOT append the "[See room info](action://room)" action link.

Here is the information about the currently logged-in guest:
- Name: ${guest?.name || "Guest"}
- RSVP Status: ${guest?.attendance || "Not RSVP'd yet"}
- Dietary/Allergies: ${guest?.dietary || "None specified"}
- Room Assigned: ${guest?.room_assigned || "None assigned yet"}
- Room Payment Status: ${guest?.room_status || "n/a"}
- Room Revealed Yet: ${guest?.is_room_revealed !== false ? "Yes" : "No"}

${roomDetails ? `Their assigned room details:\n${roomDetails}\n` : ""}

Here is the wedding schedule/itinerary:
${itinerary ? JSON.stringify(itinerary, null, 2) : "Refer to general FAQs."}

Here is the general wedding FAQ knowledge base:
"${faqContent}"

${lastBotReply ? `Previous AI Response to the user in this chat session: "${lastBotReply}"\n` : ""}

CRITICAL KNOWLEDGE BASE MATCHING RULES:
1. You MUST check the general wedding FAQ knowledge base provided above for every question.
2. The knowledge base contains all FAQs configured by Harry & Rosh (including hidden/chatbot-only FAQs like bridesmaid dress colours and child policies).
3. If a question matches or relates to an entry in the FAQ knowledge base (e.g. bridesmaid dresses, kids/children, dress code, venue location, parking, food, drinks, taxis, etc.), answer directly using that FAQ's answer!
4. Only if a question is genuinely NOT present or related to any entry in the FAQ knowledge base, guest info, or itinerary, reply: "I don't have details on that specific question, but feel free to message Rosh or Harry if you have any questions!"

User Question: ${query}
`

        // 5. Call Gemini API
        // Using gemini-3.6-flash
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [
                        {
                            role: "user",
                            parts: [
                                { text: systemPrompt }
                            ]
                        }
                    ]
                }),
            }
        )

        const data = await response.json()

        // 6. Parse Response
        if (data.error) {
            // Throw the ACTUAL Google error so we can see it
            throw new Error(`Google Error: ${data.error.message}`);
        }

        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't generate a response."

        // 7. Return Result
        return new Response(
            JSON.stringify({ reply, debugFaqLength: faqContent.length, isDbUsed: faqContent !== FAQ_CONTENT }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )

    } catch (error: any) {
        // Return 200 even on error so the client can read the error message
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
    }
})
