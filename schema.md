-- Table: guests
-- Stores all RSVP information
table guests (
  id bigint primary key,
  created_at timestamp,
  full_name text,
  phone text,
  email text,
  attendance_option text,       -- Options: 'Full Weekend', 'Friday', 'Decline'
  accommodation_preference text, -- Options: 'onsite', 'offsite'
  dietary_requirements text,
  song_request text,
  funny_story text,
  marriage_advice text,
  speech_prediction text,
  access_code text unique,      -- Unique login key (e.g., VIP-001)
  is_onsite_allowed boolean,    -- Admin Flag: Does this user see the 'Stay On Site' question?
  room_assigned text,           -- Admin: Which room they are allocated
  photo_url text,               -- Link to the uploaded image in 'guest-photos' bucket
  
  -- Plus One Logic
  has_plus_one boolean default false, -- Admin Flag: Can they bring a partner?
  plus_one_full_name text,      -- Partner's Name
  plus_one_dietary text         -- Partner's Dietary Requirements
  is_admin boolean default false, -- Grant access to Admin Panel
);