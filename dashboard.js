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
        window.location.href = 'hello.html';
        return;
    }

    // --- HELPER: Render Itinerary ---
    // Moved to bottom of file


    // --- ADMIN LINK INJECTION ---
    if (window.Auth.isAdmin()) {
        const nav = document.querySelector('.dashboard-nav .logout-btn');
        // We want to insert BEFORE the logout button or alongside it.
        const navContainer = document.querySelector('.dashboard-nav > div:last-child') || document.querySelector('.dashboard-nav');

        // Check if link already exists to prevent duplicates
        if (!document.querySelector('a[href="admin.html"]')) {
            const adminBtn = document.createElement('a');
            adminBtn.href = "admin.html";
            adminBtn.className = "nav-link-subtle";
            adminBtn.style.marginRight = "1rem";
            adminBtn.textContent = "👑 Admin Panel";

            // Insert before logout
            const logoutBtn = document.querySelector('.logout-btn');
            if (logoutBtn) {
                logoutBtn.parentNode.insertBefore(adminBtn, logoutBtn);
            }
        }
    }

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

        // Remove Swiper container if it exists, replace with scrollable content
        let contentContainer = document.getElementById('room-detail-content');
        if (!contentContainer) {
            // Clear entire modal content first to remove old Swiper structure
            // But we keep the close button
            const oldSwiper = galleryModal.querySelector('.swiper-gallery');
            if (oldSwiper) oldSwiper.style.display = 'none';

            contentContainer = document.createElement('div');
            contentContainer.id = 'room-detail-content';
            contentContainer.style.background = 'white';
            contentContainer.style.width = '90%';
            contentContainer.style.maxWidth = '600px';
            contentContainer.style.maxHeight = '90vh';
            contentContainer.style.overflowY = 'auto';
            contentContainer.style.borderRadius = '12px';
            contentContainer.style.padding = '2rem';
            contentContainer.style.position = 'relative';
            contentContainer.style.margin = 'auto'; // Center it
            contentContainer.style.marginTop = '5vh';
            galleryModal.appendChild(contentContainer);

            // Move close button inside or keep absolute
        } else {
            contentContainer.style.display = 'block';
            const oldSwiper = galleryModal.querySelector('.swiper-gallery');
            if (oldSwiper) oldSwiper.style.display = 'none';
        }

        // Clean Description
        let cleanDesc = roomData.description ? roomData.description.replace(/\[cite:.*?\]/g, '').trim() : "No description available.";

        // HTML Strings
        let imagesHtml = '';
        if (roomData.photos && roomData.photos.length > 0) {
            imagesHtml = `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 10px; margin: 1.5rem 0;">`;
            roomData.photos.forEach(url => {
                imagesHtml += `<img src="${url}" class="gallery-thumb" style="width:100%; height:100px; object-fit: cover; border-radius: 8px; cursor: pointer; border: 1px solid #ddd;" data-src="${url}">`;
            });
            imagesHtml += `</div><p style="text-align:center; font-size:0.8rem; color:#666; margin-bottom:2rem;">(Click images to view full size)</p>`;
        } else {
            imagesHtml = `<p>No photos available for this room.</p>`;
        }

        let actionHtml = '';
        if (roomStatus === 'confirmed' || roomStatus === 'paid') {
            actionHtml = `
                <div style="background: #f0fdf4; border: 1px solid #22c55e; color: #166534; padding: 1rem; border-radius: 8px; text-align: center;">
                    <strong>✓ Booking Secured</strong>
                    <p style="margin:0; font-size:0.9rem;">This room is fully paid. No further action is needed.</p>
                </div>
            `;
        } else {
            actionHtml = `
                <div style="background: #fff7ed; border: 1px solid #f97316; padding: 1.5rem; border-radius: 8px; text-align: center;">
                    <button id="btn-modal-pay-now" class="btn-primary" style="width:100%; margin-bottom:1rem; font-size:1.1rem; padding: 12px;">
                        Secure Room (Pay Now)
                    </button>
                    <p style="margin:0; font-size: 0.9rem; color: #c2410c;">
                        <strong>Warning:</strong> Your room is not secure until paid.<br>
                        Deadline for payment is 1st December 2026.
                    </p>
                </div>
            `;
        }

        // Render Content
        contentContainer.innerHTML = `
            <h2 style="color: var(--primary); text-align: center; margin-bottom: 0.5rem;">${roomName}</h2>
            <p style="text-align: center; color: #666; font-weight: bold; margin-bottom: 1.5rem;">${roomData.floor}</p>
            
            <hr style="border:0; border-top:1px solid #eee; margin: 1rem 0;">
            
            <h3 style="font-size: 1.1rem; color: #333; margin-bottom: 0.5rem;">Description</h3>
            <p style="color: #444; line-height: 1.6;">${cleanDesc}</p>
            
            <hr style="border:0; border-top:1px solid #eee; margin: 1.5rem 0;">

            <h3 style="font-size: 1.1rem; color: #333; margin-bottom: 0.5rem;">Gallery</h3>
            ${imagesHtml}

            <hr style="border:0; border-top:1px solid #eee; margin: 1.5rem 0;">

            ${actionHtml}
            <div style="height:50px;"></div> <!-- Spacer -->
        `;

        // Attach Event
        setTimeout(() => {
            const payBtn = document.getElementById('btn-modal-pay-now');
            if (payBtn) {
                payBtn.onclick = () => {
                    galleryModal.classList.remove('open');
                    window.openPaymentModal(roomName, accessCode);
                };
            }

            // Lightbox Logic
            const thumbs = contentContainer.querySelectorAll('.gallery-thumb');
            thumbs.forEach(thumb => {
                thumb.onclick = () => {
                    const src = thumb.getAttribute('data-src');
                    let lightbox = document.getElementById('app-lightbox');

                    if (!lightbox) {
                        lightbox = document.createElement('div');
                        lightbox.id = 'app-lightbox';
                        lightbox.style.position = 'fixed';
                        lightbox.style.top = '0';
                        lightbox.style.left = '0';
                        lightbox.style.width = '100%';
                        lightbox.style.height = '100%';
                        lightbox.style.background = 'rgba(0,0,0,0.9)';
                        lightbox.style.zIndex = '3000';
                        lightbox.style.display = 'flex';
                        lightbox.style.justifyContent = 'center';
                        lightbox.style.alignItems = 'center';
                        lightbox.style.opacity = '0';
                        lightbox.style.transition = 'opacity 0.3s';

                        const img = document.createElement('img');
                        img.id = 'lightbox-img';
                        img.style.maxWidth = '90%';
                        img.style.maxHeight = '90%';
                        img.style.objectFit = 'contain';
                        img.style.borderRadius = '4px';
                        img.style.boxShadow = '0 0 20px rgba(0,0,0,0.5)';

                        // Close on click anywhere
                        lightbox.onclick = () => {
                            lightbox.style.opacity = '0';
                            setTimeout(() => { lightbox.remove(); }, 300);
                        };

                        lightbox.appendChild(img);
                        document.body.appendChild(lightbox);
                    }

                    const lbImg = document.getElementById('lightbox-img');
                    if (lbImg) lbImg.src = src;

                    // Show
                    // Force reflow
                    lightbox.offsetHeight;
                    lightbox.style.opacity = '1';
                };
            });
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
            contentContainer.style.background = 'white';
            contentContainer.style.width = '90%';
            contentContainer.style.maxWidth = '600px';
            contentContainer.style.maxHeight = '90vh';
            contentContainer.style.overflowY = 'auto';
            contentContainer.style.borderRadius = '12px';
            contentContainer.style.padding = '2rem';
            contentContainer.style.position = 'relative';
            contentContainer.style.margin = 'auto'; // Center it
            contentContainer.style.marginTop = '5vh';
            galleryModal.appendChild(contentContainer);
        } else {
            contentContainer.style.display = 'block';
            const oldSwiper = galleryModal.querySelector('.swiper-gallery');
            if (oldSwiper) oldSwiper.style.display = 'none';
        }

        // Estate Content
        contentContainer.innerHTML = `
            <h2 style="color: var(--primary); text-align: center; margin-bottom: 0.5rem; font-family: 'Lato', sans-serif;">The Estate</h2>
            <p style="text-align: center; color: #666; font-style: italic; margin-bottom: 2rem;">A Victorian Gothic Masterpiece</p>
            
            <div class="estate-section">
                <h3 style="color: #556b2f; margin-bottom: 0.8rem; font-size:1.2rem;">Our Home for the Weekend</h3>
                <p style="color: #444; line-height: 1.6; font-size: 0.95rem;">
                   Huntsham Court is a Grade II* listed Victorian Gothic mansion, built in 1869 by Benjamin Ferrey for the Troyte family. 
                   With 33,000 sq ft of space, it blends historic grandeur with a relaxed, 'home-from-home' atmosphere. 
                   We have exclusive use of the entire estate, so feel free to explore the Library, the Great Hall, and the beautiful grounds.
                </p>
            </div>

            <hr style="border:0; border-top:1px solid #eee; margin: 2rem 0;">

            <div class="estate-section">
                <h3 style="color: #556b2f; margin-bottom: 0.8rem; font-size:1.2rem;">Navigate the Mansion</h3>
                
                <!-- Floor Tabs -->
                <div class="floor-tabs" id="floor-tabs">
                     <button class="floor-tab active" data-floor="0">Ground</button>
                     <button class="floor-tab" data-floor="1">First</button>
                     <button class="floor-tab" data-floor="2">Second</button>
                </div>

                <!-- Map Container -->
                <div class="map-wrapper">
                     <div class="map-scroll-container" id="map-scroll">
                         <img id="floor-map-img" class="floor-map-img" src="https://jkxxswxpykdyrpjriizx.supabase.co/storage/v1/object/public/floor-plan/Groundfloor.png" alt="Floor Plan">
                         
                         <!-- Hotspots/Pins Container -->
                         <div id="map-markers"></div>
                     </div>
                     
                     <!-- Popover (Hidden by default) -->
                     <div id="map-popover" class="map-popover">
                         <h4 id="popover-title">Room Name</h4>
                         <p id="popover-desc">Room description goes here.</p>
                     </div>
                </div>
            </div>

            <hr style="border:0; border-top:1px solid #eee; margin: 2rem 0;">

            <div class="estate-section">
                <h3 style="color: #556b2f; margin-bottom: 0.8rem; font-size:1.2rem;">Getting to Huntsham</h3>
                <p style="color: #444; line-height: 1.6; font-size: 0.95rem; margin-bottom: 1rem;">
                    The estate is located 12 minutes from Tiverton Parkway Station (2 hours from London Paddington). 
                    The main entrance is via an 800-yard driveway leading directly to the house. Ample parking is available on-site.
                </p>
                
                <a href="https://www.google.com/maps/search/?api=1&query=Huntsham+Court+EX16+7NA" target="_blank" 
                   style="display: block; width: 100%; text-align: center; background: #2f4f4f; color: white; text-decoration: none; padding: 12px; border-radius: 8px; font-weight: bold; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                   Open in Google Maps
                </a>
            </div>
            
            <div style="height:30px;"></div>
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
            { name: "Great Hall", desc: "The heart of the house with a grand fireplace.", x: 50, y: 55 },
            { name: "Library", desc: "A cozy retreat with thousands of books.", x: 25, y: 60 },
            { name: "Yellow Room", desc: "Bright and airy reception room.", x: 75, y: 40 },
            { name: "Snug Bar", desc: "Late night drinks and conversation.", x: 60, y: 75 }
        ];

        let currentFloor = 0;
        const mapImg = document.getElementById('floor-map-img');
        const markersContainer = document.getElementById('map-markers');
        const popover = document.getElementById('map-popover');
        const tabs = document.querySelectorAll('.floor-tab');

        function renderMarkers() {
            markersContainer.innerHTML = '';
            popover.classList.remove('visible');

            // 1. Render Hotspots (Only on Ground)
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

            // 2. Render User Pin (If applicable)
            const user = JSON.parse(localStorage.getItem('user'));
            if (user && user.room_assigned && window.ROOM_LIBRARY) {
                const roomData = window.ROOM_LIBRARY[user.room_assigned];
                // Check if room is on current floor
                // We use optional chaining or default to ensure safety
                let rFloorIndex = roomData.floorIndex;

                // Fallback text matching if index not set (legacy data safety)
                if (typeof rFloorIndex === 'undefined') {
                    if (roomData.floor.includes("Ground")) rFloorIndex = 0;
                    else if (roomData.floor.includes("First")) rFloorIndex = 1;
                    else if (roomData.floor.includes("Second")) rFloorIndex = 2;
                }

                if (rFloorIndex === currentFloor && roomData.mapCoords) {
                    const pin = document.createElement('div');
                    pin.className = 'user-pin';
                    pin.textContent = 'You are here';
                    pin.style.left = roomData.mapCoords.x + '%';
                    pin.style.top = roomData.mapCoords.y + '%';
                    markersContainer.appendChild(pin);
                }
            }
        }

        tabs.forEach(tab => {
            tab.onclick = () => {
                // Update UI
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                // Update State
                currentFloor = parseInt(tab.getAttribute('data-floor'));
                mapImg.src = floorImages[currentFloor];

                // Re-render
                renderMarkers();
            };
        });

        // Click map to close popover
        document.getElementById('map-scroll').onclick = () => {
            popover.classList.remove('visible');
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
