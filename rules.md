# Wedding App Rules & Logic

## 1. Core Event Details
- **Weekend:** Thursday 5th - Sunday 8th August 2027
- **Wedding Day:** Saturday 7th August
- **Location:** Huntsham Court, Devon
- **Theme:** Sage Green (#9DC183) & Cream (#FFFDD0)

## 2. Authentication & Security
- **Login Method:** Unique `access_code` (e.g., VIP-001). No passwords.
- **Session:** Store `access_code` and `full_name` in `localStorage`.
- **Admin Access:** Users with `is_admin = true` see the Admin Panel link.

## 3. Database & RSVP Logic
- **Submission:** Always use `UPDATE` (guests are pre-seeded). Never `INSERT`.
- **Photo Integrity:** When updating text fields, NEVER overwrite or nullify `photo_url`.
- **Plus One Logic:**
    - Only show "Partner Name" inputs if `has_plus_one === true`.
- **Admin Flags:**
    - `is_onsite_allowed`: Determines if they see Room options.
    - `attendance_option`: Determines which itinerary/countdown they see.

## 4. Dashboard Logic (The "Smart Gate")
- **Room Card:** ONLY render if `is_onsite_allowed === true`. (Hide completely for offsite guests).
- **Countdown Timer:**
    - If `attendance_option` == 'Full Weekend' -> Count to Thursday 12:00 PM.
    - If `attendance_option` == 'Friday Arrival' -> Count to Friday 5:00 PM.
- **Itinerary:**
    - 'Full Weekend' guests see Thursday events.
    - 'Friday' guests see Friday-Sunday only.

## 5. UI/UX Standards
- **Font:** Playfair Display (Headings), Lato/Montserrat (Body).
- **Library:** Use Swiper.js for carousels.
- **Style:** "Modern Editorial" (Glassmorphism, Gradients, Whitespace).