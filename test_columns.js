const url = "https://jkxxswxpykdyrpjriizx.supabase.co/rest/v1/guests?select=*&limit=1";
const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpreHhzd3hweWtkeXJwanJpaXp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4NzUzMTYsImV4cCI6MjA4MTQ1MTMxNn0.mu--najU_Urrt-5jAfEhPGdg6rYCrsDo_fj01BJ5abc";

async function check() {
  console.log("Fetching first guest row to check columns via REST API...");
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "apikey": anonKey,
        "Authorization": `Bearer ${anonKey}`
      }
    });
    
    console.log("REST Status:", res.status);
    const data = await res.json();
    if (data && data.length > 0) {
      console.log("Database columns available in 'guests' table:");
      console.log(Object.keys(data[0]));
    } else {
      console.log("No rows returned from 'guests' table.");
    }
  } catch (err) {
    console.error("Query Error:", err);
  }
}

check();
