document.addEventListener('DOMContentLoaded', async () => {
    window.onerror = function (msg, url, line) {
        alert("Error: " + msg + "\\nLine: " + line);
    };

    // 1. Auth Guard
    // Wait for Auth to init if needed, but it's synchronous from localStorage
    if (!window.Auth || !window.Auth.client) {
        console.error("Auth not ready");
        return;
    }

    const localUser = window.Auth.user;

    // Redirect if no user
    if (!localUser || !localUser.access_code) {
        window.location.href = 'index.html';
        return;
    }

    // --- HELPER: Render Itinerary ---
    // Moved to bottom of file




    // 2. Fetch Fresh Data from Supabase
    const supabase = window.Auth.client;
    let user = null;

    try {
        const { data, error } = await supabase
            .from('guests')
            .select('*')
            .eq('access_code', localUser.access_code)
            .single();

        if (error || !data) {
            console.error('Session Invalid:', error);
            window.Auth.logout();
            return;
        }
        user = data;
        localStorage.setItem('user', JSON.stringify(user));
        window.Auth.user = user; // Update global state

    } catch (err) {
        console.error('Fetch Error:', err);
        user = localUser;
    }

    // Initialize Itinerary Immediately
    // Access global variable if renderItineraryContent is defined below
    // Note: JS hoisting allows calling function declared below
    if (typeof renderItineraryContent === 'function') {
        renderItineraryContent(user);
    }

    // 3. Populate Header
    const nameElement = document.getElementById('guest-name');
    const badgeStatus = document.getElementById('badge-status');

    if (nameElement && user.full_name) {
        nameElement.textContent = user.full_name.split(' ')[0]; // First name only
    }

    // 4. RSVP Logic & Slide Management
    const rsvpNeededSection = document.getElementById('rsvp-needed-section');
    const swiperContainer = document.getElementById('dashboard-swiper');

    if (!user.attendance_option) {
        // --- SCENARIO A: No RSVP ---
        // Show Swiper (Blurred) + Blocker
        swiperContainer.classList.remove('hidden');
        swiperContainer.classList.add('blurred-locked');

        rsvpNeededSection.classList.remove('hidden');
        rsvpNeededSection.classList.add('overlay-center');

        badgeStatus.textContent = 'Action Required';
        badgeStatus.style.backgroundColor = '#fed7aa';
        badgeStatus.style.color = '#7c2d12';
        // Note: We CONTINUE to initialize swiper below so the background renders!
    } else {
        // --- SCENARIO B: RSVP Complete ---
        rsvpNeededSection.classList.add('hidden');
        rsvpNeededSection.classList.remove('overlay-center');

        swiperContainer.classList.remove('hidden');
        swiperContainer.classList.remove('blurred-locked');

        // Update Status Badge
        if (user.attendance_option === 'decline') {
            badgeStatus.textContent = 'Declined';
            badgeStatus.style.backgroundColor = '#e5e7eb';
            badgeStatus.style.color = '#374151';
        } else {
            badgeStatus.textContent = 'Confirmed';
            badgeStatus.style.backgroundColor = '#dcfce7';
            badgeStatus.style.color = '#166534';
        }
    }

    // Update RSVP Link with Code
    const btnUpdateRsvp = document.getElementById('btn-update-rsvp');
    const btnCompleteRsvp = document.getElementById('btn-complete-rsvp');

    if (btnUpdateRsvp) {
        btnUpdateRsvp.href = `rsvp.html?code=${user.access_code}`;
    }
    if (btnCompleteRsvp) {
        btnCompleteRsvp.href = `rsvp.html?code=${user.access_code}`;
    }

    // --- SWIPER LOGIC START ---

    // A. Room Slide Logic (Strict Check)
    const roomSlide = document.getElementById('slide-room');
    if (!user.is_onsite_allowed) {
        // Remove slide if not allowed
        if (roomSlide) roomSlide.remove();
    } else {
        // Update room details
        const roomNameDisplay = document.getElementById('room-name-display');
        const roomDescDisplay = document.getElementById('room-desc-display');
        const roomSlideActionBtn = document.querySelector('#slide-room .btn-card-action');

        // Reset button state
        if (roomSlideActionBtn) {
            roomSlideActionBtn.style.display = 'none'; // Hide by default
            roomSlideActionBtn.classList.remove('btn-card-action-confirmed');
            roomSlideActionBtn.textContent = 'View Room';
        }

        if (user.room_assigned) {
            // STATE: ASSIGNED (OFFERED or CONFIRMED)
            roomNameDisplay.textContent = user.room_assigned;

            // Lookup Description
            const roomData = window.ROOM_LIBRARY ? window.ROOM_LIBRARY[user.room_assigned] : null;
            if (roomData && roomDescDisplay) {
                let cleanDesc = roomData.description.replace(/\[cite:.*?\]/g, '').trim();
                roomDescDisplay.innerHTML = `<strong>${roomData.floor}</strong>`;

                // Hide the explicit image frame (we are using background now)
                const roomImgFrame = document.getElementById('room-image-frame');
                if (roomImgFrame) roomImgFrame.style.display = 'none';

                // Set Slide Background
                const roomSlide = document.querySelector('.card-room');
                if (roomSlide && roomData.photos && roomData.photos.length > 0) {
                    roomSlide.style.backgroundImage = `url('${roomData.photos[0]}')`;
                }
            } else if (roomDescDisplay) {
                roomDescDisplay.textContent = "Your room at Huntsham Court";
                const roomImgFrame = document.getElementById('room-image-frame');
                if (roomImgFrame) roomImgFrame.style.display = 'none';
            }

            // Check Status
            if (user.room_status === 'confirmed' || user.room_status === 'paid') {
                // CONFIRMED / PAID
                if (roomSlideActionBtn) {
                    roomSlideActionBtn.style.display = 'inline-block';
                    roomSlideActionBtn.textContent = '✓ Booking Confirmed (View)';

                    // Make it readable (White background, Green text)
                    roomSlideActionBtn.style.backgroundColor = 'white';
                    roomSlideActionBtn.style.color = '#166534';
                    roomSlideActionBtn.style.border = '1px solid white';
                    roomSlideActionBtn.style.fontWeight = 'bold';

                    // Make it clickable
                    roomSlideActionBtn.style.cursor = 'pointer';
                    roomSlideActionBtn.onclick = () => {
                        const roomData = window.ROOM_LIBRARY ? window.ROOM_LIBRARY[user.room_assigned] : null;
                        if (roomData) {
                            openRoomModal(roomData, user.room_assigned, user.room_status, user.access_code);
                        }
                    };
                }
            } else {
                // OFFERED (Pending Payment)
                if (roomSlideActionBtn) {
                    roomSlideActionBtn.style.display = 'inline-block';
                    roomSlideActionBtn.textContent = 'Find Out More';
                    roomSlideActionBtn.className = 'btn-card-action';
                    roomSlideActionBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'; // Revert to glass
                    roomSlideActionBtn.style.color = 'inherit';
                    roomSlideActionBtn.style.border = '1px solid rgba(255, 255, 255, 0.5)';
                    roomSlideActionBtn.style.cursor = 'pointer';

                    roomSlideActionBtn.onclick = () => {
                        const roomData = window.ROOM_LIBRARY ? window.ROOM_LIBRARY[user.room_assigned] : null;
                        if (roomData) {
                            openRoomModal(roomData, user.room_assigned, user.room_status, user.access_code);
                        }
                    };
                }
            }

        } else {
            // STATE: PENDING (No room assigned yet)
            roomNameDisplay.textContent = 'Allocation Pending';
            if (roomDescDisplay) {
                roomDescDisplay.textContent = "We're currently matching guests to rooms. Check back soon for your suite details!";
            }
        }
    }

    // B. Countdown Logic
    const timerVal = document.getElementById('timer-val');
    const timerLabel = document.getElementById('timer-label');

    let targetDate;

    // Only init if elements exist
    if (timerVal && timerLabel) {
        if (user.attendance_option === 'friday_arrival') {
            // Friday August 6th 2027 5:00 PM
            targetDate = new Date('2027-08-06T17:00:00');
            timerLabel.textContent = "Until The Garden Party";
        } else {
            // Thursday August 5th 2027 12:00 PM
            targetDate = new Date('2027-08-05T12:00:00');
            timerLabel.textContent = "Until The Weekend Starts";
        }
    }

    function updateTimer() {
        if (!timerVal || !timerLabel) return;

        const now = new Date();
        const diff = targetDate - now;

        if (diff <= 0) {
            timerVal.textContent = "00:00:00:00";
            return;
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        // Format: DD:HH:MM:SS
        const f = (n) => n.toString().padStart(2, '0');
        timerVal.textContent = `${f(days)}:${f(hours)}:${f(minutes)}:${f(seconds)}`;
    }

    if (timerVal && timerLabel) {
        setInterval(updateTimer, 1000);
        updateTimer(); // Initial call
    }

    // C. Itinerary Text Update
    const nextEventName = document.getElementById('next-event-name');
    if (user.attendance_option === 'friday_arrival') {
        nextEventName.textContent = "Fri 3pm: Garden Party";
    } else {
        nextEventName.textContent = "Thu 6pm: VIP Dinner";
    }

    // D. Initialize Swiper (3D Coverflow)
    // D. Initialize Swiper (3D Coverflow)
    // D. Initialize Swiper (3D Coverflow)
    const swiper = new Swiper('.swiper', {
        effect: 'coverflow',
        grabCursor: true,
        centeredSlides: true,
        slidesPerView: 'auto',
        loop: true, // Infinite loop
        coverflowEffect: {
            rotate: 50, // Standard 3D rotation
            stretch: 0,
            depth: 100, // Standard depth
            modifier: 1,
            slideShadows: true, // Enable shadows for depth
        },
        pagination: {
            el: '.swiper-pagination',
            clickable: true,
        },
        navigation: {
            nextEl: '.swiper-button-next',
            prevEl: '.swiper-button-prev',
        },
    });


    // E. Itinerary Modal Logic
    const modal = document.getElementById('itinerary-modal');
    const btnViewSchedule = document.getElementById('btn-view-schedule');
    const closeBtn = document.querySelector('#itinerary-modal .close-modal'); // Specific Selector

    // NEW: Render Itinerary Function
    function renderItineraryContent(currentUser) {
        const timelineContainer = document.querySelector('.itinerary-scroll-container');
        const schedule = window.itinerarySchedule; // Get global data

        if (!timelineContainer || !schedule) return;

        // Clear existing content
        timelineContainer.innerHTML = '';

        schedule.forEach(daySchedule => {
            // Filter: If Friday Arrival, skip Thursday
            if (currentUser && currentUser.attendance_option === 'friday_arrival' && daySchedule.day === 'Thursday') {
                return; // Skip this iteration
            }

            const dayGroup = document.createElement('div');
            dayGroup.className = 'day-group';

            const dayHeader = document.createElement('h3');
            // Simple date logic for display
            let dateSuffix = "8th";
            if (daySchedule.day === 'Friday') dateSuffix = "6th";
            if (daySchedule.day === 'Saturday') dateSuffix = "7th";
            dayHeader.textContent = daySchedule.events[0] ? `${daySchedule.day}, August ${dateSuffix}` : daySchedule.day;

            dayHeader.className = 'day-header';
            dayGroup.appendChild(dayHeader);

            const timelineItems = document.createElement('div');
            timelineItems.className = 'timeline-items';

            daySchedule.events.forEach(event => {
                const detailsEl = document.createElement('details');
                detailsEl.className = 'timeline-event';

                // Add Gold Highlight for Saturday
                if (daySchedule.day === 'Saturday') {
                    detailsEl.classList.add('highlight-gold');
                }

                const summaryEl = document.createElement('summary');
                summaryEl.className = 'timeline-summary';

                // 1. Time Column
                const timeCol = document.createElement('div');
                timeCol.className = 'time-column';
                timeCol.innerHTML = `<span class="event-time">${event.time.split(' - ')[0]}</span>`;

                // 2. Marker Column
                const markerCol = document.createElement('div');
                markerCol.className = 'marker-column';
                const dot = document.createElement('div');
                dot.className = `timeline-dot ${daySchedule.day === 'Saturday' ? 'gold' : ''}`;
                const line = document.createElement('div');
                line.className = `timeline-line ${daySchedule.day === 'Saturday' ? 'gold' : ''}`;
                markerCol.appendChild(dot);
                markerCol.appendChild(line);

                // 3. Content Column
                const contentCol = document.createElement('div');
                contentCol.className = 'content-column';
                contentCol.innerHTML = `<span class="event-title">${event.summary}</span>`;

                // Assemble Summary
                summaryEl.appendChild(timeCol);
                summaryEl.appendChild(markerCol);
                summaryEl.appendChild(contentCol);

                // 4. Chevron (Arrow)
                const chevron = document.createElement('span');
                chevron.className = 'chevron';
                chevron.textContent = '▼';
                summaryEl.appendChild(chevron);

                detailsEl.appendChild(summaryEl);

                // Accordion Content
                if (event.details) {
                    const accordionContent = document.createElement('div');
                    accordionContent.className = 'event-accordion-content';
                    accordionContent.innerHTML = `<p>${event.details}</p>`;
                    detailsEl.appendChild(accordionContent);
                } else {
                    summaryEl.addEventListener('click', (e) => {
                        e.preventDefault();
                    });
                    detailsEl.classList.add('no-details');
                }

                timelineItems.appendChild(detailsEl);
            });

            dayGroup.appendChild(timelineItems);
            timelineContainer.appendChild(dayGroup);
        });
    }

    // Open Modal
    if (btnViewSchedule) {
        btnViewSchedule.addEventListener('click', () => {
            modal.classList.add('open');
            // Re-render on open to ensure fresh state
            const currentUser = JSON.parse(localStorage.getItem('user'));
            renderItineraryContent(currentUser);
        });
    }

    // Close Modal (X button)
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.classList.remove('open');
        });
    }

    // Close Modal (Click Background)
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('open');
        }
        if (e.target === faqModal) {
            faqModal.classList.remove('open');
        }
    });

    // F. FAQ / Chatbot Logic
    const faqModal = document.getElementById('faq-modal');
    const btnOpenFaq = document.getElementById('btn-open-faq');
    const closeFaqBtn = document.querySelector('.close-faq');

    // Global context variable
    let aiContext = "";

    // Toggle Static List
    const faqToggle = document.getElementById('faq-toggle');
    const faqList = document.getElementById('faq-static-list');

    if (faqToggle && faqList) {
        faqToggle.addEventListener('click', () => {
            const isHidden = faqList.classList.contains('hidden');
            if (isHidden) {
                faqList.classList.remove('hidden');
                faqToggle.classList.add('active');
            } else {
                faqList.classList.add('hidden');
                faqToggle.classList.remove('active');
            }
        });
    }

    // REFACTORED: renderStaticFAQs
    async function renderStaticFAQs() {
        const listContainer = document.getElementById('faq-static-list');
        if (listContainer.children.length > 1) return;

        // Use global variable from faq_data.js
        let content = (typeof FAQ_CONTENT !== 'undefined') ? FAQ_CONTENT : "";

        if (!content) {
            listContainer.innerHTML = "<p>No FAQs found.</p>";
            return;
        }

        aiContext = content; // Sync global context

        // Parse Md to HTML Accordion
        const lines = content.split('\n');
        let html = '';
        let inQuestion = false;

        lines.forEach(line => {
            if (line.startsWith('## ')) {
                if (inQuestion) html += '</div></details>';
                const question = line.replace('## ', '').trim();
                html += `<details class="faq-item"><summary>${question}</summary><div class="faq-answer">`;
                inQuestion = true;
            } else if (line.trim().length > 0 && inQuestion) {
                html += `<p>${line.trim()}</p>`;
            }
        });
        if (inQuestion) html += '</div></details>';

        listContainer.innerHTML = html;
    }

    // Context loading is now handled by renderStaticFAQs or just reading the variable
    function loadFaqContext() {
        if (aiContext) return;
        if (typeof FAQ_CONTENT !== 'undefined') {
            aiContext = FAQ_CONTENT;
        }
    }

    if (btnOpenFaq) {
        btnOpenFaq.addEventListener('click', () => {
            faqModal.classList.add('open');
            // Load Context for Chat
            loadFaqContext();
            // Render Static List (checks internally if needed)
            renderStaticFAQs();
        });
    }

    if (closeFaqBtn) {
        closeFaqBtn.addEventListener('click', () => {
            faqModal.classList.remove('open');
        });
    }

    // Chat Interface
    const chatInput = document.getElementById('faq-chat-input');
    const chatSubmit = document.getElementById('faq-chat-submit');
    const chatOutput = document.getElementById('faq-chat-output');

    function addBubble(text, isBot = false) {
        const bubble = document.createElement('div');
        bubble.className = `chat-bubble ${isBot ? 'bot' : 'user'}`;
        bubble.textContent = text;
        chatOutput.appendChild(bubble);
        chatOutput.scrollTop = chatOutput.scrollHeight;
    }

    function handleChatSubmit() {
        const query = chatInput.value.trim();
        if (!query) return;

        // 1. Show User Message
        addBubble(query, false);
        chatInput.value = '';

        // 2. Call Supabase Edge Function using Fetch
        addBubble("Thinking...", true);
        const loadingBubble = chatOutput.lastElementChild;

        // Construct URL handled by SDK
        // Usage: supabase.functions.invoke('function-name', { body: {} })

        supabase.functions.invoke('gemini-faq', {
            body: { query: query }
        })
            .then(({ data, error }) => {
                if (error) {
                    // Supabase SDK returns an error object if the function fails or returns non-2xx
                    console.error("Function Error:", error);

                    // Try to handle specific status codes if exposed, otherwise generic
                    // The SDK 'error' object typically usually contains context
                    let msg = error.message || JSON.stringify(error);

                    if (msg.includes('Not Found') || msg.includes('404')) {
                        addBubble("Error 404: Function not found. Check if the function name is 'gemini-faq' in Supabase.", true);
                    } else if (msg.includes('Failed to send')) {
                        addBubble("Connection Failed. The function may not be deployed, or the name 'gemini-faq' is wrong.", true);
                    } else if (msg.includes('non-2xx')) {
                        addBubble("Server Error (400/500). Please check your Supabase Function Logs. (Hint: Did you set GEMINI_API_KEY?)", true);
                    } else {
                        addBubble(`Concierge Error: ${msg}`, true);
                    }
                    return;
                }

                // Success
                loadingBubble.remove();
                if (data && data.reply) {
                    addBubble(data.reply, true);
                } else if (data && data.error) {
                    addBubble(`AI Error: ${data.error}`, true);
                } else {
                    addBubble("I didn't get a clear answer.", true);
                }
            })
            .catch(err => {
                loadingBubble.remove();
                console.error("Invoke Error:", err);
                if (err.message.includes('Failed to send')) {
                    addBubble("System Error: Could not connect to 'gemini-faq'. Please check your Supabase Function deployment.", true);
                } else {
                    addBubble(`System Error: ${err.message}`, true);
                }
            });
    }

    window.askFAQ = function (query) {
        if (!chatInput) return;
        chatInput.value = query;
        handleChatSubmit();
    };

    if (chatSubmit) {
        chatSubmit.addEventListener('click', handleChatSubmit);
    }

    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleChatSubmit();
            }
        });
    }

    // G. Payment Modal Logic
    const payModal = document.getElementById('payment-modal');
    const closePayBtn = document.querySelector('.close-payment');

    window.openPaymentModal = function (roomName, accessCode) {
        if (!payModal) return;
        document.getElementById('pay-room-name').textContent = roomName;
        document.getElementById('pay-ref').textContent = accessCode;
        payModal.classList.add('open');
    };

    if (closePayBtn) {
        closePayBtn.addEventListener('click', () => {
            payModal.classList.remove('open');
        });
    }

    if (payModal) {
        window.addEventListener('click', (e) => {
            if (e.target === payModal) {
                payModal.classList.remove('open');
            }
        });
    }


    // H. Room Details Modal Logic
    const galleryModal = document.getElementById('gallery-modal');
    const closeGalleryBtn = document.querySelector('.close-gallery');
    let gallerySwiper = null; // Keeping reference in case we revert, but not used in new flow
    window.openRoomModal = function (roomData, roomName, roomStatus, accessCode) {
        if (!galleryModal) return;

        let contentContainer = document.getElementById('room-detail-content');
        if (!contentContainer) {
            const oldSwiper = galleryModal.querySelector('.swiper-gallery');
            if (oldSwiper) oldSwiper.style.display = 'none';

            contentContainer = document.createElement('div');
            contentContainer.id = 'room-detail-content';
            contentContainer.className = 'modal-content';
            contentContainer.style.background = 'rgba(253, 251, 247, 0.95)';
            contentContainer.style.width = '90%';
            contentContainer.style.maxWidth = '600px';
            contentContainer.style.maxHeight = '90vh';
            contentContainer.style.overflowY = 'auto';
            contentContainer.style.borderRadius = '24px';
            contentContainer.style.padding = '2.5rem';
            contentContainer.style.position = 'relative';
            contentContainer.style.margin = 'auto';
            contentContainer.style.marginTop = '5vh';
            galleryModal.appendChild(contentContainer);
        } else {
            contentContainer.style.display = 'block';
            const oldSwiper = galleryModal.querySelector('.swiper-gallery');
            if (oldSwiper) oldSwiper.style.display = 'none';
        }

        // Clean Description
        let cleanDesc = roomData.description ? roomData.description.replace(/\[cite:.*?\]/g, '').trim() : "No description available.";

        // Compile Amenities dynamically based on description keywords
        const amenities = [
            "📶 High-speed Wi-Fi",
            "☕ Coffee & Tea Station",
            "🧴 Luxury Linens & Toiletries",
            "🏰 Estate Gardens Access"
        ];

        // Parse bed details
        if (cleanDesc.toLowerCase().includes("four-poster")) {
            amenities.unshift("🛏&nbsp;King Four-Poster Bed");
        } else if (cleanDesc.toLowerCase().includes("super-king")) {
            amenities.unshift("🛏&nbsp;Super-King Bed");
        } else if (cleanDesc.toLowerCase().includes("king-size")) {
            amenities.unshift("🛏&nbsp;King Bed");
        } else if (cleanDesc.toLowerCase().includes("double bed")) {
            amenities.unshift("🛏&nbsp;Double Bed");
        } else if (cleanDesc.toLowerCase().includes("sofa bed")) {
            amenities.unshift("🛏&nbsp;Sofa Bed Option");
        } else {
            amenities.unshift("🛏&nbsp;Premium Bedding");
        }

        // Parse bathroom details
        if (cleanDesc.toLowerCase().includes("twin baths")) {
            amenities.push("🛁 Twin Bathrooms");
        } else if (cleanDesc.toLowerCase().includes("bath and separate shower")) {
            amenities.push("🛁 Bath & Separate Shower");
        } else if (cleanDesc.toLowerCase().includes("wet room")) {
            amenities.push("🚿 Accessible Wet Room");
        } else if (cleanDesc.toLowerCase().includes("shower")) {
            amenities.push("🚿 En-suite Shower");
        } else if (cleanDesc.toLowerCase().includes("bathroom")) {
            amenities.push("🛁 Private Bathroom");
        }

        // Build Slider HTML
        let sliderHtml = '';
        if (roomData.photos && roomData.photos.length > 0) {
            sliderHtml = `
                <div class="swiper room-photo-swiper">
                    <div class="swiper-wrapper">
            `;
            roomData.photos.forEach(url => {
                sliderHtml += `
                    <div class="swiper-slide">
                        <img src="${url}" alt="${roomName}">
                    </div>
                `;
            });
            sliderHtml += `
                    </div>
                    <div class="swiper-pagination"></div>
                    <div class="swiper-button-next"></div>
                    <div class="swiper-button-prev"></div>
                </div>
            `;
        } else {
            sliderHtml = `
                <div style="width:100%; height:200px; background:#f5f5f5; border-radius:12px; display:flex; align-items:center; justify-content:center; color:#888; margin-bottom:1.5rem;">
                    No photos available for this room
                </div>
            `;
        }

        // Build Status HTML
        let statusHtml = '';
        if (roomStatus === 'confirmed' || roomStatus === 'paid') {
            statusHtml = `
                <div style="background: rgba(34, 197, 94, 0.08); border: 1px solid rgba(34, 197, 94, 0.25); color: #166534; padding: 1.25rem; border-radius: 12px; display: flex; align-items: center; gap: 1rem; margin-top: 1.5rem;">
                    <span style="font-size: 2rem; line-height: 1;">✓</span>
                    <div style="text-align: left;">
                        <strong style="display:block; font-size: 0.95rem;">Booking Guaranteed</strong>
                        <span style="font-size: 0.85rem; opacity: 0.9;">Your payment has been received and your suite is secured.</span>
                    </div>
                </div>
            `;
        } else {
            statusHtml = `
                <div style="background: rgba(249, 115, 22, 0.08); border: 1px solid rgba(249, 115, 22, 0.25); color: #c2410c; padding: 1.25rem; border-radius: 12px; margin-top: 1.5rem; text-align: left;">
                    <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
                        <span style="font-size: 2rem; line-height: 1;">⏳</span>
                        <div>
                            <strong style="display:block; font-size: 0.95rem;">Awaiting Payment</strong>
                            <span style="font-size: 0.85rem; opacity: 0.9;">Please secure your reservation. Deadline: 1st December 2026.</span>
                        </div>
                    </div>
                    <button id="btn-modal-pay-now" class="btn-primary" style="width: 100%; font-size: 1rem; padding: 10px; text-transform: none; box-shadow: none;">
                        Secure Room (Pay Now)
                    </button>
                </div>
            `;
        }

        // Render HTML inside container (keeping the close button we prepended)
        const closeBtnHtml = `<span class="close-modal" onclick="document.getElementById('gallery-modal').classList.remove('open')">&times;</span>`;
        contentContainer.innerHTML = `
            ${closeBtnHtml}
            ${sliderHtml}
            <div style="text-align: left;">
                <span class="room-badge">${roomData.floor}</span>
                <h2 style="font-family: 'Playfair Display', serif; font-size: 2.2rem; color: var(--text-main); margin-bottom: 0.5rem; line-height:1.2;">${roomName}</h2>
                
                <p style="color: #444; line-height: 1.6; font-size: 0.95rem; margin-bottom: 1.5rem;">${cleanDesc}</p>
                
                <h3 style="font-family: 'Montserrat', sans-serif; font-size: 1rem; font-weight:600; margin-bottom: 0.75rem; color: var(--text-main);">Suite Amenities</h3>
                <div class="amenity-grid">
                    ${amenities.map(a => '<div class="amenity-item">' + a + '</div>').join('')}
                </div>
                
                ${statusHtml}
            </div>
            <div style="height:10px;"></div>
        `;

        // Initialize Swiper for photos
        setTimeout(() => {
            if (roomData.photos && roomData.photos.length > 0) {
                new Swiper('.room-photo-swiper', {
                    pagination: { el: '.room-photo-swiper .swiper-pagination', clickable: true },
                    navigation: { nextEl: '.room-photo-swiper .swiper-button-next', prevEl: '.room-photo-swiper .swiper-button-prev' },
                    loop: roomData.photos.length > 1,
                    observer: true,
                    observeParents: true
                });
            }

            const payBtn = document.getElementById('btn-modal-pay-now');
            if (payBtn) {
                payBtn.onclick = () => {
                    galleryModal.classList.remove('open');
                    window.openPaymentModal(roomName, accessCode);
                };
            }
        }, 0);

        galleryModal.classList.add('open');
    };

    // I. Estate Modal Logic
    const btnExploreEstate = document.getElementById('btn-explore-estate');
    window.openEstateModal = function () {
        if (!galleryModal) return;

        // Clear/Setup Container (Reusing same logic as Room Modal)
        let contentContainer = document.getElementById('room-detail-content');
        if (!contentContainer) {
            const oldSwiper = galleryModal.querySelector('.swiper-gallery');
            if (oldSwiper) oldSwiper.style.display = 'none';

            contentContainer = document.createElement('div');
            contentContainer.id = 'room-detail-content';
            contentContainer.className = 'modal-content';
            galleryModal.appendChild(contentContainer);
        } else {
            contentContainer.style.display = 'block';
            contentContainer.className = 'modal-content';
            // Clear any inline styles that might clash
            contentContainer.style.background = '';
            contentContainer.style.width = '';
            contentContainer.style.maxWidth = '';
            contentContainer.style.maxHeight = '';
            contentContainer.style.overflowY = '';
            contentContainer.style.borderRadius = '';
            contentContainer.style.padding = '';
            contentContainer.style.position = '';
            contentContainer.style.margin = '';
            contentContainer.style.marginTop = '';
            const oldSwiper = galleryModal.querySelector('.swiper-gallery');
            if (oldSwiper) oldSwiper.style.display = 'none';
        }

        // Estate Content
        contentContainer.innerHTML = `
            <span class="close-modal" onclick="document.getElementById('gallery-modal').classList.remove('open')">&times;</span>
            <h2 class="estate-modal-title">The Estate</h2>
            <p class="estate-modal-subtitle">A Victorian Gothic Masterpiece</p>
            
            <div class="estate-section">
                <h3>Our Home for the Weekend</h3>
                <p>
                   Huntsham Court is a Grade II* listed Victorian Gothic mansion, built in 1869 by Benjamin Ferrey for the Troyte family. 
                   With 33,000 sq ft of space, it blends historic grandeur with a relaxed, 'home-from-home' atmosphere. 
                   We have exclusive use of the entire estate, so feel free to explore the Library, the Great Hall, and the beautiful grounds.
                </p>
            </div>

            <hr class="estate-divider">

            <div class="estate-section">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.8rem;">
                    <h3 style="margin: 0;">Navigate the Mansion</h3>
                    <button id="btn-toggle-mapper" class="btn-card-action" style="display: none; margin: 0; padding: 0.4rem 1rem; font-size: 0.8rem; border-color: var(--primary); color: var(--primary); background: transparent;">
                        Open Dev Mapper
                    </button>
                </div>
                
                <!-- Mapper panel (Hidden by default) -->
                <div id="mapper-panel" class="hidden" style="background: rgba(193, 162, 122, 0.08); border: 1px solid rgba(193, 162, 122, 0.25); padding: 1.25rem; border-radius: 16px; margin-bottom: 1.5rem; text-align: left;">
                    <h4 style="font-family: 'Playfair Display', serif; color: var(--primary); margin-bottom: 0.5rem; font-size: 1.1rem;">Coordinate Mapper Tool</h4>
                    <p style="font-size: 0.85rem; margin-bottom: 1rem; color: var(--text-muted); line-height: 1.4;">
                        Select a room from the dropdown, then click on its location on the floor plan map below. The coordinate will be assigned immediately.
                    </p>
                    <div style="display: flex; gap: 0.75rem; align-items: center; margin-bottom: 1rem; flex-wrap: wrap;">
                        <label style="font-size: 0.9rem; font-weight: 600; color: var(--text-main);">Target Room:</label>
                        <select id="mapper-room-select" style="flex: 1; min-width: 180px; padding: 0.5rem; border-radius: 8px; border: 1px solid rgba(193, 162, 122, 0.3); font-family: 'Montserrat', sans-serif; font-size: 0.9rem; outline: none; background: white;"></select>
                    </div>
                    <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
                        <button id="btn-mapper-clear" style="padding: 0.5rem 1rem; border-radius: 50px; border: 1px solid rgba(193, 162, 122, 0.3); background: white; color: var(--text-main); font-size: 0.8rem; cursor: pointer; font-weight: 500; transition: all 0.2s;">Clear Coordinate</button>
                        <button id="btn-mapper-export" style="padding: 0.5rem 1.2rem; border-radius: 50px; border: none; background: var(--primary); color: white; font-size: 0.8rem; cursor: pointer; font-weight: 600; transition: all 0.2s; box-shadow: 0 2px 5px rgba(193, 162, 122, 0.3);">Export room_data.js</button>
                    </div>
                    
                    <div id="mapper-export-box" class="hidden" style="margin-top: 1.25rem; border-top: 1px dashed rgba(193, 162, 122, 0.25); padding-top: 1.25rem;">
                        <p style="font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem; color: var(--text-main);">Copy this text and paste it to overwrite your room_data.js file:</p>
                        <textarea id="mapper-export-text" readonly style="width: 100%; height: 180px; font-family: monospace; font-size: 0.75rem; padding: 0.75rem; border-radius: 8px; border: 1px solid rgba(193, 162, 122, 0.25); background: rgba(255, 255, 255, 0.8); box-sizing: border-box; resize: vertical; outline: none;"></textarea>
                        <button id="btn-mapper-copy" style="margin-top: 0.75rem; width: 100%; padding: 0.6rem; border: none; background: #22c55e; color: white; font-weight: 600; border-radius: 50px; cursor: pointer; font-size: 0.85rem; letter-spacing: 0.05em; text-transform: uppercase; transition: all 0.2s;">Copy to Clipboard</button>
                    </div>
                </div>

                <!-- Map Container -->
                <div class="map-wrapper" id="map-wrapper-container" style="padding: 1rem; box-sizing: border-box;">
                     <div class="map-header-bar" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; width: 100%;">
                          <div class="floor-tabs" id="floor-tabs" style="margin-bottom: 0; flex: 1; margin-right: 0.5rem;">
                               <button class="floor-tab active" data-floor="0">Ground</button>
                               <button class="floor-tab" data-floor="1">First</button>
                               <button class="floor-tab" data-floor="2">Second</button>
                          </div>
                          <div style="display: flex; gap: 0.5rem; flex-shrink: 0;">
                              <button id="btn-map-fullscreen" class="btn-card-action" style="margin: 0; padding: 0.4rem 0.8rem; font-size: 0.8rem; display: flex; align-items: center; gap: 0.3rem; border-color: var(--primary); color: var(--primary); background: transparent;">
                                  <span>⛶</span> Fullscreen
                              </button>
                              <button id="btn-close-map-fullscreen" class="btn-card-action" style="display: none; margin: 0; padding: 0.4rem 0.8rem; font-size: 0.8rem; background: var(--primary); color: white; border: none; border-radius: 50px;">
                                  ✕ Close
                              </button>
                          </div>
                     </div>

                     <div class="map-scroll-container" id="map-scroll">
                          <div class="map-zoom-area" style="position: relative; display: inline-block; width: 100%;">
                               <img id="floor-map-img" class="floor-map-img" src="https://jkxxswxpykdyrpjriizx.supabase.co/storage/v1/object/public/floor-plan/Groundfloor.png" alt="Floor Plan">
                               <div id="map-markers" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"></div>
                          </div>
                     </div>
                     
                     <!-- Popover (Hidden by default) -->
                     <div id="map-popover" class="map-popover">
                          <h4 id="popover-title">Room Name</h4>
                          <p id="popover-desc">Room description goes here.</p>
                     </div>
                </div>
            </div>

            <hr class="estate-divider">

            <div class="estate-section">
                <h3>Getting to Huntsham</h3>
                <p style="margin-bottom: 1.25rem;">
                    The estate is located 12 minutes from Tiverton Parkway Station (2 hours from London Paddington). 
                    The main entrance is via an 800-yard driveway leading directly to the house. Ample parking is available on-site.
                </p>
                
                <a href="https://www.google.com/maps/search/?api=1&query=Huntsham+Court+EX16+7NA" target="_blank" class="btn-estate-map">
                   Open in Google Maps
                </a>
            </div>
            
            <div style="height:10px;"></div>
        `;

        galleryModal.classList.add('open');

        // --- Interactive Map Logic ---
        const floorImages = [
            "https://jkxxswxpykdyrpjriizx.supabase.co/storage/v1/object/public/floor-plan/Groundfloor.png",
            "https://jkxxswxpykdyrpjriizx.supabase.co/storage/v1/object/public/floor-plan/Floor1.png",
            "https://jkxxswxpykdyrpjriizx.supabase.co/storage/v1/object/public/floor-plan/Floor2.png"
        ];

        // Ground Floor Hotspots (x,y in %)
        const groundHotspots = [
            { name: "Butlers Pantry", desc: "A historic pantry connecting the dining spaces and kitchen, once the nerve center of mansion service.", x: 40.8, y: 8.9 },
            { name: "Diamond room", desc: "An elegant, smaller reception room with fine architectural details.", x: 65.9, y: 13.6 },
            { name: "Yellow room", desc: "A bright, beautiful south-facing reception room, perfect for morning tea and socializing.", x: 85.6, y: 12.9 },
            { name: "Library", desc: "A cozy retreat filled with thousands of books, rich woodwork, and comfortable seating.", x: 88.2, y: 37.8 },
            { name: "Great Hall", desc: "The grand heart of Huntsham Court, featuring a majestic fireplace and oak paneling.", x: 72.4, y: 51.0 },
            { name: "Snug Bar", desc: "A warm and inviting space for late-night cocktails, drafts, and lively conversation.", x: 55.9, y: 41.6 },
            { name: "Entrance Hall", desc: "The grand entrance foyer welcoming you into the historic Victorian estate.", x: 84.2, y: 65.5 },
            { name: "Kitchen", desc: "The expansive, fully equipped country-style commercial kitchen of the mansion.", x: 25.9, y: 31.4 }
        ];

        let currentFloor = 0;
        const mapImg = document.getElementById('floor-map-img');
        const markersContainer = document.getElementById('map-markers');
        const popover = document.getElementById('map-popover');
        const tabs = document.querySelectorAll('.floor-tab');

        // Mapper Panel Elements
        const btnToggleMapper = document.getElementById('btn-toggle-mapper');
        const mapperPanel = document.getElementById('mapper-panel');
        const roomSelect = document.getElementById('mapper-room-select');
        const btnClearCoord = document.getElementById('btn-mapper-clear');
        const btnExport = document.getElementById('btn-mapper-export');
        const exportBox = document.getElementById('mapper-export-box');
        const exportText = document.getElementById('mapper-export-text');
        const btnCopy = document.getElementById('btn-mapper-copy');

        // Helper to get floor index based on floor name string
        function getRoomFloorIndex(roomData) {
            let rFloorIndex = roomData.floorIndex;
            if (typeof rFloorIndex === 'undefined') {
                const fl = roomData.floor.toLowerCase();
                
                // Garden wing belongs to Ground floor (index 0)
                if (fl.includes("garden")) {
                    return 0;
                }
                
                // Always ignore other outbuildings/wings outside the main building
                if (fl.includes("lodge") || fl.includes("gate")) {
                    return -1;
                }
                
                // If it already has mapCoords, map it to the tab so it renders
                if (roomData.mapCoords) {
                    if (fl.includes("ground")) {
                        return 0;
                    } else if (fl.includes("first")) {
                        return 1;
                    } else if (fl.includes("second") || fl.includes("third") || fl.includes("loft") || fl.includes("eaves")) {
                        return 2;
                    }
                }
                
                if (fl.includes("ground")) {
                    rFloorIndex = 0;
                } else if (fl.includes("first")) {
                    rFloorIndex = 1;
                } else if (fl.includes("second") || fl.includes("third") || fl.includes("loft") || fl.includes("eaves")) {
                    rFloorIndex = 2;
                } else {
                    rFloorIndex = -1; // Ignore unknown floors
                }
            }
            return rFloorIndex;
        }

        // Function to populate rooms select dropdown
        function populateRoomSelect() {
            if (!roomSelect || !window.ROOM_LIBRARY) return;
            roomSelect.innerHTML = '';
            
            // Filter rooms by active floor tab
            Object.entries(window.ROOM_LIBRARY).forEach(([roomName, roomData]) => {
                const floorIdx = getRoomFloorIndex(roomData);
                if (floorIdx === currentFloor) {
                    const option = document.createElement('option');
                    option.value = roomName;
                    const hasCoord = roomData.mapCoords ? ' (Mapped)' : '';
                    option.textContent = `${roomName}${hasCoord}`;
                    roomSelect.appendChild(option);
                }
            });
        }

        const isDevMode = new URLSearchParams(window.location.search).has('dev');
        if (btnToggleMapper) {
            if (isDevMode) {
                btnToggleMapper.style.display = 'inline-block';
            } else {
                btnToggleMapper.style.display = 'none';
            }
            btnToggleMapper.onclick = () => {
                mapperPanel.classList.toggle('hidden');
                const isOpen = !mapperPanel.classList.contains('hidden');
                btnToggleMapper.textContent = isOpen ? 'Close Dev Mapper' : 'Open Dev Mapper';
                if (isOpen) {
                    populateRoomSelect();
                    renderMarkers();
                } else {
                    exportBox.classList.add('hidden');
                    renderMarkers();
                }
            };
        }

        // Coordinates Helper & click event for dev mapper
        const mapScrollElement = document.getElementById('map-scroll');
        if (mapScrollElement) {
            mapScrollElement.addEventListener('click', (e) => {
                if (e.target.classList.contains('map-hotspot') || e.target.classList.contains('room-pin') || e.target.classList.contains('user-pin')) {
                    return;
                }
                
                const rect = mapImg.getBoundingClientRect();
                const x = parseFloat(((e.clientX - rect.left) / rect.width * 100).toFixed(1));
                const y = parseFloat(((e.clientY - rect.top) / rect.height * 100).toFixed(1));
                
                console.log(`Click coordinates relative to map size: "mapCoords": { "x": ${x}, "y": ${y} }`);
                
                // If dev mapper is open, record the coordinate
                const isMapperOpen = mapperPanel && !mapperPanel.classList.contains('hidden');
                if (isMapperOpen && roomSelect && roomSelect.value && window.ROOM_LIBRARY) {
                    const selectedRoom = roomSelect.value;
                    window.ROOM_LIBRARY[selectedRoom].mapCoords = { x, y };
                    
                    // Re-render markers (showing all mapped rooms on the current floor in Dev Mode)
                    renderMarkers();
                    
                    // Re-populate dropdown to show it's mapped, preserving selection or moving to next
                    const currentIndex = roomSelect.selectedIndex;
                    populateRoomSelect();
                    
                    // Select the next room in dropdown list automatically to make it lightning fast
                    if (currentIndex + 1 < roomSelect.options.length) {
                        roomSelect.selectedIndex = currentIndex + 1;
                    } else {
                        roomSelect.selectedIndex = 0;
                    }
                }
            });
        }

        if (btnClearCoord) {
            btnClearCoord.onclick = () => {
                if (roomSelect && roomSelect.value && window.ROOM_LIBRARY) {
                    const selectedRoom = roomSelect.value;
                    delete window.ROOM_LIBRARY[selectedRoom].mapCoords;
                    renderMarkers();
                    populateRoomSelect();
                }
            };
        }

        if (btnExport) {
            btnExport.onclick = () => {
                if (!window.ROOM_LIBRARY || !exportBox || !exportText) return;
                
                // Construct the full JS code
                const code = `// room_data.js - Huntsham Court Hospitality Database\nwindow.ROOM_LIBRARY = ${JSON.stringify(window.ROOM_LIBRARY, null, 4)};\n`;
                exportText.value = code;
                exportBox.classList.remove('hidden');
                exportText.select();
            };
        }

        if (btnCopy) {
            btnCopy.onclick = () => {
                if (!exportText) return;
                exportText.select();
                navigator.clipboard.writeText(exportText.value)
                    .then(() => {
                        const originalText = btnCopy.textContent;
                        btnCopy.textContent = 'Copied!';
                        btnCopy.style.background = '#15803d'; // dark green
                        setTimeout(() => {
                            btnCopy.textContent = originalText;
                            btnCopy.style.background = '#22c55e'; // reset green
                        }, 2000);
                    })
                    .catch(err => {
                        console.error('Failed to copy: ', err);
                        alert('Please copy manually.');
                    });
            };
        }

        function renderMarkers() {
            markersContainer.innerHTML = '';
            popover.classList.remove('visible');

            // 1. Render General Hotspots (Only on Ground)
            if (currentFloor === 0) {
                groundHotspots.forEach(spot => {
                    const el = document.createElement('div');
                    el.className = 'map-hotspot';
                    el.style.left = spot.x + '%';
                    el.style.top = spot.y + '%';

                    el.onclick = (e) => {
                        e.stopPropagation();
                        document.getElementById('popover-title').textContent = spot.name;
                        document.getElementById('popover-desc').textContent = spot.desc;
                        popover.classList.add('visible');
                    };
                    markersContainer.appendChild(el);
                });
            }

            // 2. Render Room Pins for ALL rooms in ROOM_LIBRARY that have coordinates
            if (window.ROOM_LIBRARY) {
                const isMapperOpen = mapperPanel && !mapperPanel.classList.contains('hidden');
                
                Object.entries(window.ROOM_LIBRARY).forEach(([roomName, roomData]) => {
                    if (!roomData.mapCoords) return;

                    let rFloorIndex = getRoomFloorIndex(roomData);

                    if (rFloorIndex === currentFloor) {
                        // Check if this is the logged-in user's assigned room
                        const currentUser = JSON.parse(localStorage.getItem('user'));
                        const isUserRoom = currentUser && currentUser.room_assigned === roomName;
                        
                        // IF Dev Mapper is open, render ALL pins. Otherwise, ONLY render the user's room
                        if (!isMapperOpen && !isUserRoom) return;

                        const el = document.createElement('div');
                        el.className = isUserRoom ? 'user-pin' : 'room-pin';
                        if (isUserRoom) {
                            el.textContent = 'You are here';
                        }
                        
                        el.style.left = roomData.mapCoords.x + '%';
                        el.style.top = roomData.mapCoords.y + '%';

                        el.onclick = (e) => {
                            e.stopPropagation();
                            document.getElementById('popover-title').textContent = roomName;
                            
                            // Compile short details
                            let desc = roomData.description ? roomData.description.replace(/\[cite:.*?\]/g, '').trim() : "No description available.";
                            document.getElementById('popover-desc').textContent = desc;
                            popover.classList.add('visible');
                        };
                        markersContainer.appendChild(el);
                    }
                });
            }
        }

        function switchFloor(floorIdx) {
            currentFloor = floorIdx;
            tabs.forEach(t => {
                if (parseInt(t.getAttribute('data-floor')) === floorIdx) {
                    t.classList.add('active');
                } else {
                    t.classList.remove('active');
                }
            });
            mapImg.src = floorImages[currentFloor];
            const isMapperOpen = mapperPanel && !mapperPanel.classList.contains('hidden');
            if (isMapperOpen) {
                populateRoomSelect();
            }
            renderMarkers();
        }

        tabs.forEach(tab => {
            tab.onclick = () => {
                switchFloor(parseInt(tab.getAttribute('data-floor')));
            };
        });

        // Touch Swiping logic for switching floors
        let touchStartX = 0;
        let touchStartY = 0;
        const mapScroll = document.getElementById('map-scroll');
        
        if (mapScroll) {
            mapScroll.addEventListener('touchstart', (e) => {
                if (e.touches.length > 1) return;
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
            }, { passive: true });
            
            mapScroll.addEventListener('touchend', (e) => {
                if (e.changedTouches.length === 0) return;
                const touchEndX = e.changedTouches[0].clientX;
                const touchEndY = e.changedTouches[0].clientY;
                
                const deltaX = touchEndX - touchStartX;
                const deltaY = touchEndY - touchStartY;
                
                if (Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
                    const isFullscreen = document.getElementById('map-wrapper-container').classList.contains('fullscreen-active');
                    if (isFullscreen) {
                        const scrollLeft = mapScroll.scrollLeft;
                        const maxScroll = mapScroll.scrollWidth - mapScroll.clientWidth;
                        if (deltaX < 0 && scrollLeft < maxScroll - 15) return;
                        if (deltaX > 0 && scrollLeft > 15) return;
                    }
                    
                    if (deltaX < 0) {
                        if (currentFloor < 2) {
                            switchFloor(currentFloor + 1);
                        }
                    } else {
                        if (currentFloor > 0) {
                            switchFloor(currentFloor - 1);
                        }
                    }
                }
            }, { passive: true });
        }

        // Fullscreen map logic
        const btnFullscreen = document.getElementById('btn-map-fullscreen');
        const btnCloseFullscreen = document.getElementById('btn-close-map-fullscreen');
        const mapWrapper = document.getElementById('map-wrapper-container');

        if (btnFullscreen && mapWrapper) {
            btnFullscreen.onclick = () => {
                mapWrapper.classList.add('fullscreen-active');
                popover.classList.remove('visible');
            };
        }

        if (btnCloseFullscreen && mapWrapper) {
            btnCloseFullscreen.onclick = () => {
                mapWrapper.classList.remove('fullscreen-active');
                popover.classList.remove('visible');
            };
        }

        // Click map to close popover
        document.getElementById('map-scroll').onclick = (e) => {
            if (!e.target.classList.contains('map-hotspot') && !e.target.classList.contains('room-pin') && !e.target.classList.contains('user-pin')) {
                popover.classList.remove('visible');
            }
        };

        // Initial Render
        renderMarkers();
    };

    if (btnExploreEstate) {
        btnExploreEstate.addEventListener('click', () => {
            window.openEstateModal();
        });
    }

    if (closeGalleryBtn) {
        closeGalleryBtn.addEventListener('click', () => {
            galleryModal.classList.remove('open');
        });
    }

    if (galleryModal) {
        galleryModal.addEventListener('click', (e) => {
            if (e.target === galleryModal) galleryModal.classList.remove('open');
        });
    }

});
