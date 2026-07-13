// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// ⚠️ DEBUGGING: Paste your key inside the quotes below
const HARDCODED_KEY = "";

const FAQ_CONTENT = `
# Wedding FAQs & Information

📅 The 3-Day Itinerary & Schedule
What time should I arrive on the first day? We will be welcoming guests from 5pm 
What time does everything wrap up on the final day? Guests need to checkout by 10:30am
Are there any gaps between events where we can explore Devon? You are welcome to explore Devon in the mornings, we will be putting on optional activities 
📍 Venue & Devon Logistics
What is the exact address of the venue? Huntsham Court, Huntsham, Tiverton EX16 7NA 
Is there parking available on-site, and is it free? Yes, there is plenty of parking available free of charge
Can I leave my car at the venue overnight? Of course! 
What is the closest train station to the venue? Tiverton Parkway with speed links to London (1hr55) Bristol (45min) and Exeter (15min) is just 12 minutes by taxi to Huntsham Court. postcode (EX167NA) brings you to the door. 
How easy is it to get a taxi in the area? We highly recommend booking taxis in advance as Huntsham is in a rural area and taxis can be hard to come by on the spot.
Do you have numbers for local taxi companies we should pre-book? A-2-B taxis – 01884 251 252 (www.a2btaxistiverton.co.uk), RT Taxis – 07731 154 024, Rick’s Private Hire – 07789 998 224 (ricksprivatehire@yahoo.com), Brian’s Taxi – 07753 791 810, Liz Cabs – 07899 903 314 (www.lizcabs.jimdo.com), Parkway Taxis – 01884 388 99 (www.taxidevon.co.uk), Devon Transfers Private Hire – 07425 262087 (www.devontransfers.co.uk), Chris Cars – 07773 600 125, Hero 2 Transport – 01884 212 447 (www.hero2transport.co.uk), Hatch Green Coaches (www.hatchgreencoaches.co.uk)
Is there reliable phone signal or Wi-Fi at the venue? There is wifi throughout the property
Is the venue wheelchair accessible / suitable for those with limited mobility? Yes, please request a downstairs room if needed
What happens if it rains? Is there an indoor backup plan? We are crossing our fingers for good weather! But yes, there will be a back up plan
🛏️ Accommodation & Packing
What nearby hotels, B&Bs, or Airbnbs do you recommend? Hartnoll Hotel (Tiverton, 6m) - www.hartnollhotel.co.uk, Lawpit Lodges (Tiverton, 6m) - www.lawpitlodges.co.uk, Three Gates Farm (Huntsham, 1.5m) - www.threegatesfarm.co.uk, Weston House Devon (Bampton, 4m) - www.westonhousedevon.co.uk, Bishops Barton (Greenham, 5m) - www.bishopsbarton.co.uk, Travelodge (Sampford Peverell, 5m) - www.travelodge.co.uk, Brambles Bed and Breakfast (Sampford Peverell, 5m) - www.bramblesbedandbreakfast.co.uk, Berry House and Farm (Shillingford, 4m) - www.berryhouseandfarm.co.uk, Waterside House (Uplowman, 3m), Old Mill Cottages (Shillingford, 3m), Cottage for Two (Staple Cross, 2.5m)
When is the deadline to book our accommodation? Payment needs to be received by 1 December to secure your room
Is there a swimming pool, hot tub, or beach access nearby we should pack for? No, there is not a swimming pool or hottub. 
👗 Dress Code & Footwear
What is the dress code for Day 1? Summer cocktail party. Dresses, skirts, jeans all welcome. Trainers are fine.
What is the dress code for Day 2? Garden party. Florals, sandals, shorts, polos, tshirts all fine. Trainers also allowed, we will be playing games
What is the dress code for Day 3? Wedding day attire! Typical summer wedding. Ties are not mandatory. Please no jeans or trainers
Will any part of the wedding be on grass, pebbles, or sand? (Important for heel choice!) Lots of grass on the croquet lawn and in the gardens!
Should I bring warm layers for the evening? We would suggest checking the weather forecast beforehand, there will be some evening events outside so bring layers if needed. 
🍽️ Food, Drinks & Dietary Needs
Which meals are being provided over the three days? We are having pizza, picnic lunch (dips, crisps, sausage rolls etc), BBQ (hot dogs, burgers, salads), fajitas. Breakfast is provided for those staying on site, which will be a spread of sausages/bacon rolls, yoghurt, fruit, granola, tea and coffee. Snacks will be available in the Butler’s Pantry throughout the weekend
Which meals or drinks do we need to pay for ourselves? None, everything is included! 
Is there a cash bar, or can we pay by card/contactless? All drink is included
Can I bring my own alcohol or drinks to the venue? We will be providing plenty of drinks, however if you would like to bring something specific of your own you are more than welcome to. We would suggest keeping this in your rooms so that it does not get mixed up with other drinks! 
👶 Children & Plus-Ones
Is babysitting or a crèche available at the venue? No
Can I bring a plus-one? Please do not bring a plus-one, all invited guests are named on invites
My partner’s name wasn’t on the invite, can they still come? All invited guests are named on the invites. Please message either Rosh or Harry to double check if you are concerned
🎁 RSVPs & Gifts
When is the RSVP deadline? 7th February 2027
How do I RSVP for the different days? Please update your RSVP form on our website
Do you have a wedding gift registry or a wishing well? We will be setting up a donation link towards our honeymoon
Where can I find your gift registry link? Details will be included on the website
📸 On the Day Rules & Fun
Can I take photos and videos during the ceremony? We have a photographer and content creator capturing all of our ceremony. Please turn off your phones and keep them away. 
Can we bring confetti, and does it need to be biodegradable? We will be providing confetti, please do not bring your own.
Is there a theme for the weekend? Fun! 
Are pets allowed at the venue? No, please do not bring pets to the venue. 
🚨 Emergency & Last-Minute Queries
Who should I contact on the day if I get lost or have an emergency? Please do NOT contact the bride or groom. If you need assistance, please contact Natalie (our coordinator) or a member of the bridal party.
Who should i ask questions prior to the event? Either rosh or harry is on hand to answer any queries you may have
Who can i ask questions to during the event regarding logistics and timings etc? Please refrain from asking Rosh or Harry questions during the weekend. If anything is unclear, we will have our wedding coordinator Natalie on site, or please ask a member of the bridal party. 
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

${lastBotReply ? `Previous AI Response to the user in this chat session: "${lastBotReply}"\n` : ""}

CRITICAL TRANSITIVITY & ADJACENCY RULE:
If the answer is NOT directly available in the provided guest info, itinerary, or general FAQ, do NOT make up any answers. Instead:
1. If the user asks about "hiring a car" or "car rental", say: "I don't have information on car rentals, but would you like details about local taxi companies instead?"
2. If they ask about other adjacent topics (like EV charging, parking overflow, train schedules, hotels, baby items), check if you have related content (e.g. on-site parking details, train station info, nearby hotels list, baby cots) and ask if they would like that instead (e.g. "I'm sorry, I don't have information on EV chargers, but would you like to see the general on-site parking info instead?").
3. If they say "Yes", "Yes please", "Sure", "Ok", or give another affirmative response, and your "Previous AI Response" offered taxi numbers or other info, interpret their query as a request for that information and provide it (e.g., if they say "yes please" after you offered taxi numbers, output the list of taxi numbers).
4. Otherwise, politely say "I'm sorry, I don't have information about that."

If the user asks about their own room, RSVP, or dietary information, use the Guest information above to answer them directly.
If they ask about the wedding timeline or agenda, use the itinerary above.
If the answer is in the general FAQ, answer it politely and concisely.

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
