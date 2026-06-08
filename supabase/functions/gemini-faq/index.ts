// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// ⚠️ DEBUGGING: Paste your key inside the quotes below
const HARDCODED_KEY = "";

const FAQ_CONTENT = `
# Wedding FAQ

## When is the big day?
We are celebrating the weekend of August 5th - 8th, 2027. The big day is Saturday, August 7th!

## What is the dress code?
The dress code is relaxed for most of the weekend. However, we ask that you dress up ("fancy") for the actual wedding day on August 7th.

## Are kids invited?
We love your little ones, but due to space restrictions, we have decided to keep our wedding and reception an adults-only event. We hope you understand and can still join us!

## Are gifts welcome?
Your presence at our wedding is the greatest gift of all. However, we strictly request donations to our honeymoon fund instead of physical gifts.
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
        const { query, guest, roomDetails, itinerary } = await req.json()
        if (!query) {
            throw new Error('No query provided')
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
- Their room assignment/details: append [See room info](action://room)
- The wedding schedule/timeline: append [See plan](action://itinerary)
- The estate maps/directions: append [Explore estate](action://estate)
- The photo gallery: append [View gallery](action://gallery)
- Updating RSVP details: append [Update RSVP](action://rsvp)

Example:
User: "Which room am I in?"
Response: "You are staying in the Huntsham Suite. [See room info](action://room)"


Here is the information about the currently logged-in guest:
- Name: ${guest?.name || "Guest"}
- RSVP Status: ${guest?.attendance || "Not RSVP'd yet"}
- Dietary/Allergies: ${guest?.dietary || "None specified"}
- Room Assigned: ${guest?.room_assigned || "None assigned yet"}
- Room Payment Status: ${guest?.room_status || "n/a"}

${roomDetails ? `Their assigned room details:\n${roomDetails}\n` : ""}

Here is the wedding schedule/itinerary:
${itinerary ? JSON.stringify(itinerary, null, 2) : "Refer to general FAQs."}

Here is the general wedding FAQ knowledge base:
"${FAQ_CONTENT}"

If the user asks about their own room, RSVP, or dietary information, use the Guest information above to answer them directly.
If they ask about the wedding timeline or agenda, use the itinerary above.
If the answer is in the general FAQ, answer it politely and concisely.
If the answer is NOT available in the provided guest info, itinerary, or general FAQ, politely say "I'm sorry, I don't have information about that." Do NOT make up any answers.

User Question: ${query}
`

        // 5. Call Gemini API
        // Using gemini-2.5-flash as gemini-2.0-flash is retired
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
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
            JSON.stringify({ reply }),
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
