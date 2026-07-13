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

    function shouldHideDrinks(name) {
        if (!name) return false;
        const targetNames = [
            "mick timoney",
            "min timoney",
            "yuan watkis",
            "annabella watkis"
        ];
        return targetNames.includes(name.trim().toLowerCase());
    }

    // --- HELPER: Render Itinerary ---
    // Moved to bottom of file

    // Itinerary Modal States (declared early to avoid temporal dead zone reference errors)
    let itineraryActiveDay = 'Thursday';
    if (localUser) {
        if (localUser.attendance_option === 'friday_arrival') {
            itineraryActiveDay = 'Friday';
        } else if (localUser.attendance_option === 'ceremony_only') {
            itineraryActiveDay = 'Saturday';
        }
    }
    let itineraryViewMode = 'storybook'; // 'storybook' (zoomed in) or 'overview' (zoomed out)
    let itinerarySwiper = null;
    let rsvpAutoSaveTimeout = null;
    let targetDate;

    // 2. Fetch Fresh Data from Supabase (with a 5-second timeout fallback)
    const supabase = window.Auth.client;
    let user = null;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        console.warn('Supabase fetch timed out after 5s, falling back to local cache.');
        controller.abort();
    }, 5000);

    try {
        const { data, error } = await supabase
            .from('guests')
            .select('*')
            .eq('access_code', localUser.access_code)
            .single()
            .abortSignal(controller.signal);

        clearTimeout(timeoutId);

        if (error || !data) {
            console.error('Session Invalid:', error);
            window.Auth.logout();
            return;
        }
        user = data;
        localStorage.setItem('user', JSON.stringify(user));
        window.Auth.user = user; // Update global state

    } catch (err) {
        clearTimeout(timeoutId);
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
    const declineSection = document.getElementById('decline-section');
    const swiperContainer = document.getElementById('dashboard-swiper');

    function updateDashboardState(currentUser) {
        if (!currentUser) return;

        const badgeStatus = document.getElementById('badge-status');
        const rsvpNeededSection = document.getElementById('rsvp-needed-section');
        const declineSection = document.getElementById('decline-section');
        const swiperContainer = document.getElementById('dashboard-swiper');

        if (!currentUser.attendance_option) {
            // SCENARIO A: No RSVP
            if (swiperContainer) {
                swiperContainer.classList.remove('hidden');
                swiperContainer.classList.add('blurred-locked');
            }
            if (rsvpNeededSection) {
                rsvpNeededSection.classList.remove('hidden');
                rsvpNeededSection.classList.add('overlay-center');
            }
            if (declineSection) {
                declineSection.classList.add('hidden');
            }
            if (badgeStatus) {
                badgeStatus.textContent = 'Action Required';
                badgeStatus.style.backgroundColor = '#fed7aa';
                badgeStatus.style.color = '#7c2d12';
            }
        } else if (currentUser.attendance_option === 'decline') {
            // SCENARIO B: Declined RSVP
            if (rsvpNeededSection) {
                rsvpNeededSection.classList.add('hidden');
                rsvpNeededSection.classList.remove('overlay-center');
            }
            if (swiperContainer) {
                swiperContainer.classList.add('hidden');
            }
            if (declineSection) {
                declineSection.classList.remove('hidden');
            }
            if (badgeStatus) {
                badgeStatus.textContent = 'Declined';
                badgeStatus.style.backgroundColor = '#e5e7eb';
                badgeStatus.style.color = '#374151';
            }
        } else {
            // SCENARIO C: RSVP Confirmed (Attending)
            if (rsvpNeededSection) {
                rsvpNeededSection.classList.add('hidden');
                rsvpNeededSection.classList.remove('overlay-center');
            }
            if (declineSection) {
                declineSection.classList.add('hidden');
            }
            if (swiperContainer) {
                swiperContainer.classList.remove('hidden');
                swiperContainer.classList.remove('blurred-locked');
            }
            if (badgeStatus) {
                badgeStatus.textContent = 'Confirmed';
                badgeStatus.style.backgroundColor = '#dcfce7';
                badgeStatus.style.color = '#166534';
            }
        }

        // Update guest name display
        const nameElement = document.getElementById('guest-name');
        if (nameElement && currentUser.full_name) {
            nameElement.textContent = currentUser.full_name.split(' ')[0];
        }

        // Update Swiper if instantiated
        if (window.mySwiperInstance) {
            window.mySwiperInstance.update();
        }

        // Refresh dynamic countdown target and itinerary content
        if (typeof initCountdown === 'function') {
            initCountdown(currentUser);
        }
        if (typeof initNextEvent === 'function') {
            initNextEvent(currentUser);
        }
        if (typeof renderItineraryContent === 'function') {
            renderItineraryContent(currentUser);
        }
    }

    // Call state update initially
    updateDashboardState(user);

    // RSVP Modal Elements
    const rsvpModal = document.getElementById('rsvp-modal');
    const btnUpdateRsvp = document.getElementById('btn-update-rsvp');
    const btnCompleteRsvp = document.getElementById('btn-complete-rsvp');
    const btnUpdateRsvpDecline = document.getElementById('btn-update-rsvp-decline');
    const closeRsvpBtn = document.querySelector('#rsvp-modal .close-modal');
    const closeRsvpBtnAction = document.querySelector('#rsvp-modal .close-rsvp-btn');
    const rsvpModalForm = document.getElementById('rsvp-modal-form');

    function openRsvpModal() {
        if (!rsvpModal) return;
        
        // Reset form visibility and confirmation screen
        if (rsvpModalForm) rsvpModalForm.classList.remove('hidden');
        const confirmScreen = document.getElementById('rsvp-modal-confirmation');
        if (confirmScreen) confirmScreen.classList.add('hidden');
        
        rsvpModal.classList.add('open');
        populateRsvpModal(user);
    }

    async function closeRsvpModal() {
        if (!rsvpModal) return;
        
        // Trigger save immediately if anything is pending
        if (rsvpAutoSaveTimeout) {
            clearTimeout(rsvpAutoSaveTimeout);
            await triggerRsvpAutoSave();
        }
        
        rsvpModal.classList.remove('open');
        updateDashboardState(user);
    }

    if (btnUpdateRsvp) {
        btnUpdateRsvp.addEventListener('click', openRsvpModal);
    }
    if (btnCompleteRsvp) {
        btnCompleteRsvp.addEventListener('click', openRsvpModal);
    }
    if (btnUpdateRsvpDecline) {
        btnUpdateRsvpDecline.addEventListener('click', openRsvpModal);
    }
    if (closeRsvpBtn) {
        closeRsvpBtn.addEventListener('click', closeRsvpModal);
    }
    if (closeRsvpBtnAction) {
        closeRsvpBtnAction.addEventListener('click', closeRsvpModal);
    }
    
    const btnCloseConfirm = document.getElementById('btn-close-confirm');
    if (btnCloseConfirm) {
        btnCloseConfirm.addEventListener('click', () => {
            closeRsvpModal();
        });
    }

    // Modal Photo Helpers
    function getPhotoUrls(photoUrlField) {
        if (!photoUrlField) return [];
        if (photoUrlField.startsWith('[') && photoUrlField.endsWith(']')) {
            try {
                return JSON.parse(photoUrlField);
            } catch (e) {
                console.error("Failed to parse photo URLs JSON:", e);
                return [photoUrlField];
            }
        }
        return [photoUrlField];
    }

    function renderPhotoGallery(urls, containerId, onDeleteCallback) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = '';
        if (urls.length === 0) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'flex';
        urls.forEach((url, index) => {
            const item = document.createElement('div');
            item.className = 'uploaded-photo-item';

            const img = document.createElement('img');
            img.src = url;
            img.alt = `Uploaded photo ${index + 1}`;

            const delBtn = document.createElement('div');
            delBtn.className = 'uploaded-photo-delete';
            delBtn.innerHTML = '&times;';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                onDeleteCallback(index);
            });

            item.appendChild(img);
            item.appendChild(delBtn);
            container.appendChild(item);
        });
    }

    async function deleteModalPhoto(index) {
        const indicator = document.getElementById('rsvp-status-indicator');
        const statusText = indicator ? indicator.querySelector('.status-text') : null;
        const statusDot = indicator ? indicator.querySelector('.status-dot') : null;
        if (statusText) statusText.textContent = 'Saving...';
        if (statusDot) statusDot.style.background = '#eab308';

        try {
            const { data: latestGuest, error: fetchErr } = await supabase
                .from('guests')
                .select('photo_url')
                .eq('access_code', user.access_code)
                .single();

            if (fetchErr) throw fetchErr;

            let currentUrls = getPhotoUrls(latestGuest.photo_url);
            currentUrls.splice(index, 1);

            const serialized = currentUrls.length > 0 ? JSON.stringify(currentUrls) : null;

            const { error: dbError } = await supabase
                .from('guests')
                .update({ photo_url: serialized })
                .eq('access_code', user.access_code);

            if (dbError) throw dbError;

            // Sync local user states
            user.photo_url = serialized;
            localStorage.setItem('user', JSON.stringify(user));
            window.Auth.user = user;

            renderPhotoGallery(currentUrls, 'rsvp-uploaded-photos-container', (idx) => deleteModalPhoto(idx));

            if (statusText) statusText.textContent = 'All changes saved';
            if (statusDot) statusDot.style.background = '#10b981';
        } catch (err) {
            console.error('Delete modal photo error:', err);
            if (statusText) statusText.textContent = 'Failed to delete photo';
            if (statusDot) statusDot.style.background = '#ef4444';
        }
    }

    // Modal Dynamic Branching
    function handleModalAttendanceChange(value) {
        const accommodationGroup = document.getElementById('rsvp-accommodation-group');
        const accommodationLabel = document.getElementById('rsvp-accommodation-label');
        const step3 = document.getElementById('rsvp-step3-section');
        const step4 = document.getElementById('rsvp-step4-section');
        
        if (value === 'decline') {
            if (accommodationGroup) accommodationGroup.classList.add('hidden');
            if (step3) step3.classList.add('hidden');
            if (step4) step4.classList.add('hidden');
        } else {
            const isOnsiteAllowed = user?.is_onsite_allowed;
            if (accommodationGroup) {
                if (isOnsiteAllowed) {
                    accommodationGroup.classList.remove('hidden');
                } else {
                    accommodationGroup.classList.add('hidden');
                }
            }
            if (step3) step3.classList.remove('hidden');
            if (step4) step4.classList.remove('hidden');

            if (accommodationLabel) {
                if (value === 'friday_arrival') {
                    accommodationLabel.innerHTML = `<strong>Note:</strong> On-site rooms are extremely limited and prioritised for guests staying the full weekend. If you can make the full weekend, we highly recommend updating your attendance option above! However, would you still like to be considered for on-site accommodation if a room becomes available?`;
                } else {
                    accommodationLabel.innerHTML = `We'd love you to stay at Huntsham Court with us, however you can opt to find your own accomodation if preferred. Rooms will be prioritised to full weekend guests.`;
                }
            }
        }
    }

    function populateRsvpModal(data) {
        if (!data || !rsvpModalForm) return;

        document.getElementById('rsvp-accessCode').value = data.access_code || '';
        document.getElementById('rsvp-fullName').value = data.full_name || '';
        document.getElementById('rsvp-phone').value = data.phone || '';
        document.getElementById('rsvp-dietary').value = data.dietary_requirements || '';
        document.getElementById('rsvp-funnyStory').value = data.funny_story || '';
        document.getElementById('rsvp-advice').value = data.marriage_advice || '';
        document.getElementById('rsvp-speechBet').value = data.speech_prediction || '';
        document.getElementById('rsvp-song_request').value = data.song_request || '';

        // Check if drinks should be hidden
        const drinksSec = document.getElementById('rsvp-drinks-section');
        if (drinksSec) {
            if (shouldHideDrinks(data.full_name)) {
                drinksSec.classList.add('hidden');
            } else {
                drinksSec.classList.remove('hidden');
            }
        }

        // Checkboxes: Drinks
        rsvpModalForm.querySelectorAll('input[name="drink_pref"]').forEach(cb => cb.checked = false);
        document.getElementById('rsvp-special_drink_requests').value = '';
        if (data.drink_preferences) {
            try {
                const parsed = JSON.parse(data.drink_preferences);
                if (parsed && Array.isArray(parsed.drinks)) {
                    parsed.drinks.forEach(val => {
                        const cb = rsvpModalForm.querySelector(`input[name="drink_pref"][value="${val}"]`);
                        if (cb) cb.checked = true;
                    });
                }
                if (parsed && parsed.special) {
                    document.getElementById('rsvp-special_drink_requests').value = parsed.special;
                }
            } catch (e) {
                document.getElementById('rsvp-special_drink_requests').value = data.drink_preferences;
            }
        }

        // Set saved value to hidden input
        const hiddenInput = document.getElementById('rsvp-attendance-hidden-input');
        if (hiddenInput) {
            hiddenInput.value = data.attendance_option || 'full_weekend';
        }

        // Radio Buttons: Accommodation
        if (data.accommodation_preference) {
            const radio = rsvpModalForm.querySelector(`input[name="accommodation"][value="${data.accommodation_preference}"]`);
            if (radio) radio.checked = true;
        } else {
            rsvpModalForm.querySelectorAll('input[name="accommodation"]').forEach(r => r.checked = false);
        }



        // Trigger dynamic form branching based on saved attendance
        handleModalAttendanceChange(data.attendance_option);

        // Render Photo Gallery
        const urls = getPhotoUrls(data.photo_url);
        renderPhotoGallery(urls, 'rsvp-uploaded-photos-container', (idx) => deleteModalPhoto(idx));

        // Reset status indicator to Saved initially
        const indicator = document.getElementById('rsvp-status-indicator');
        if (indicator) {
            indicator.querySelector('.status-text').textContent = 'All changes saved';
            indicator.querySelector('.status-dot').style.background = '#10b981';
        }

        // Initialize modal wizard state and components
        syncModalVisualSelections();
        renderModalRoomTeaser(data.room_assigned);
        initRsvpDatesLogic(document.getElementById('rsvp-modal'));
        setupModalFlashCards();
        setupModalWizard();
        showModalStepPane(1);
    }


    async function triggerRsvpAutoSave() {
        const indicator = document.getElementById('rsvp-status-indicator');
        if (!indicator) return;
        const statusText = indicator.querySelector('.status-text');
        const statusDot = indicator.querySelector('.status-dot');
        statusText.textContent = 'Saving...';
        statusDot.style.background = '#eab308'; // Amber

        const formData = new FormData(rsvpModalForm);
        const accessCode = user.access_code;
        if (!accessCode) return;

        const drinksHidden = shouldHideDrinks(user.full_name);
        const selectedDrinks = drinksHidden ? [] : Array.from(rsvpModalForm.querySelectorAll('input[name="drink_pref"]:checked')).map(el => el.value);
        const specialRequests = drinksHidden ? "" : document.getElementById('rsvp-special_drink_requests').value;

        const payload = {
            full_name: formData.get('fullName'),
            phone: formData.get('phone'),
            attendance_option: formData.get('attendance'),
            accommodation_preference: formData.get('accommodation') || null,
            dietary_requirements: formData.get('dietary'),
            drink_preferences: JSON.stringify({ drinks: selectedDrinks, special: specialRequests }),
            funny_story: formData.get('funnyStory'),
            marriage_advice: formData.get('advice'),
            speech_prediction: formData.get('speechBet'),
            song_request: formData.get('song_request')
        };

        try {
            const { data: updatedData, error: updateError } = await supabase
                .from('guests')
                .update(payload)
                .eq('access_code', accessCode)
                .select();

            if (updateError) throw updateError;

            // Sync user to localStorage
            if (updatedData && updatedData[0]) {
                user = { ...user, ...updatedData[0] };
                localStorage.setItem('user', JSON.stringify(user));
                window.Auth.user = user;
            }

            // Update Dashboard UI
            updateDashboardState(user);

            statusText.textContent = 'All changes saved';
            statusDot.style.background = '#10b981'; // Green
        } catch (err) {
            console.error('Auto-save error:', err);
            statusText.textContent = 'Save failed';
            statusDot.style.background = '#ef4444'; // Red
        }
    }

    function queueRsvpAutoSave() {
        if (rsvpAutoSaveTimeout) clearTimeout(rsvpAutoSaveTimeout);
        rsvpAutoSaveTimeout = setTimeout(triggerRsvpAutoSave, 1000);
    }

    if (rsvpModalForm) {
        rsvpModalForm.addEventListener('input', (e) => {
            if ((e.target.tagName === 'INPUT' && (e.target.type === 'text' || e.target.type === 'tel')) || e.target.tagName === 'TEXTAREA') {
                queueRsvpAutoSave();
            }
        });

        rsvpModalForm.addEventListener('change', (e) => {
            if (e.target.tagName === 'INPUT' && e.target.type === 'radio') {
                if (e.target.name === 'attendance') {
                    handleModalAttendanceChange(e.target.value);
                }
                triggerRsvpAutoSave();
            }
            if (e.target.tagName === 'INPUT' && e.target.type === 'checkbox') {
                triggerRsvpAutoSave();
            }
            if ((e.target.tagName === 'INPUT' && (e.target.type === 'text' || e.target.type === 'tel')) || e.target.tagName === 'TEXTAREA') {
                if (rsvpAutoSaveTimeout) clearTimeout(rsvpAutoSaveTimeout);
                triggerRsvpAutoSave();
            }
        });

        // Photo Upload Auto-save inside modal (Multiple Files)
        const rsvpModalPhotoInput = document.getElementById('rsvp-photoUpload');
        if (rsvpModalPhotoInput) {
            rsvpModalPhotoInput.addEventListener('change', async () => {
                const files = Array.from(rsvpModalPhotoInput.files);
                if (files.length === 0) return;

                // Check 5 photos limit
                const currentUrls = getPhotoUrls(user.photo_url);
                if (currentUrls.length + files.length > 5) {
                    alert(`You can upload a maximum of 5 photos. You currently have ${currentUrls.length} photo(s) uploaded and selected ${files.length} more.`);
                    rsvpModalPhotoInput.value = '';
                    
                    const indicator = document.getElementById('rsvp-status-indicator');
                    const statusText = indicator ? indicator.querySelector('.status-text') : null;
                    const statusDot = indicator ? indicator.querySelector('.status-dot') : null;
                    if (statusText) statusText.textContent = 'Upload cancelled (max 5 photos)';
                    if (statusDot) statusDot.style.background = '#ef4444';
                    return;
                }

                const indicator = document.getElementById('rsvp-status-indicator');
                const statusText = indicator ? indicator.querySelector('.status-text') : null;
                const statusDot = indicator ? indicator.querySelector('.status-dot') : null;
                if (statusText) statusText.textContent = 'Uploading photo(s)...';
                if (statusDot) statusDot.style.background = '#eab308';

                try {
                    const { data: latestGuest, error: fetchErr } = await supabase
                        .from('guests')
                        .select('photo_url')
                        .eq('access_code', user.access_code)
                        .single();

                    if (fetchErr) throw fetchErr;

                    let currentUrls = getPhotoUrls(latestGuest.photo_url);

                    const uploadPromises = files.map(async (file) => {
                        const fileExt = file.name.split('.').pop();
                        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
                        const filePath = `${fileName}`;

                        const { data: uploadData, error: uploadError } = await supabase.storage
                            .from('guest-photos')
                            .upload(filePath, file);

                        if (uploadError) throw uploadError;

                        const { data: publicUrlData } = supabase.storage
                            .from('guest-photos')
                            .getPublicUrl(filePath);

                        return publicUrlData.publicUrl;
                    });

                    const newUrls = await Promise.all(uploadPromises);
                    const updatedUrls = [...currentUrls, ...newUrls];
                    const serialized = JSON.stringify(updatedUrls);

                    // Update database
                    const { error: dbError } = await supabase
                        .from('guests')
                        .update({ photo_url: serialized })
                        .eq('access_code', user.access_code);

                    if (dbError) throw dbError;

                    // Sync locally
                    user.photo_url = serialized;
                    localStorage.setItem('user', JSON.stringify(user));
                    window.Auth.user = user;

                    // Render gallery
                    renderPhotoGallery(updatedUrls, 'rsvp-uploaded-photos-container', (idx) => deleteModalPhoto(idx));

                    // Clear file input
                    rsvpModalPhotoInput.value = '';

                    if (statusText) statusText.textContent = 'Uploaded successfully!';
                    if (statusDot) statusDot.style.background = '#10b981';
                } catch (err) {
                    console.error('Modal photo upload error:', err);
                    if (statusText) statusText.textContent = 'Upload failed';
                    if (statusDot) statusDot.style.background = '#ef4444';
                }
            });
        }
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

            // Render price display on main card
            const priceDisplay = document.getElementById('room-price-display');
            if (priceDisplay) {
                priceDisplay.textContent = "Loading price...";
                (async () => {
                    try {
                        let roomData = null;
                        let res = await supabase.from('rooms').select('*').eq('name', user.room_assigned).single();
                        if (res.data) roomData = res.data;
                        else {
                            res = await supabase.from('rooms').select('*').eq('room_name', user.room_assigned).single();
                            if (res.data) roomData = res.data;
                        }

                        if (roomData) {
                            const price = roomData.price_per_night ?? roomData.price ?? 0;
                            const nights = roomData.nights ?? 3;
                            const totalCost = price * nights;

                            const isPaid = (user.room_status === 'paid' || user.room_status === 'confirmed');
                            if (isPaid) {
                                priceDisplay.innerHTML = `Room Cost: <strong style="color: #166534;">Paid ✓</strong>`;
                            } else if (user.shares_room_payment) {
                                priceDisplay.innerHTML = `Owed: <strong>£${totalCost.toLocaleString()}</strong> (Paid Together)`;
                            } else {
                                const countRes = await supabase.from('guests').select('id', { count: 'exact', head: true }).eq('room_assigned', user.room_assigned);
                                const occupantCount = countRes.count || 1;
                                const costPerPerson = totalCost / occupantCount;
                                priceDisplay.innerHTML = `Your Share: <strong>£${costPerPerson.toLocaleString(undefined, {maximumFractionDigits:0})}</strong> (Separately)`;
                            }
                        } else {
                            priceDisplay.textContent = "Pricing details TBC";
                        }
                    } catch (err) {
                        console.error("Failed to load room price on card:", err);
                        priceDisplay.textContent = "";
                    }
                })();
            }

            // Lookup Description
            const roomData = window.ROOM_LIBRARY ? window.ROOM_LIBRARY[user.room_assigned] : null;
            if (roomData && roomDescDisplay) {
                let cleanDesc = roomData.description.replace(/\[cite:.*?\]/g, '').trim();
                roomDescDisplay.innerHTML = `<strong>${roomData.floor}</strong>`;

                // Hide the explicit image frame (we are using background now)
                const roomImgFrame = document.getElementById('room-image-frame');
                if (roomImgFrame) roomImgFrame.style.display = 'none';

                // Set Slide Background (commented out to preserve the cartoon background in the carousel)
                // const roomSlide = document.querySelector('.card-room');
                // if (roomSlide && roomData.photos && roomData.photos.length > 0) {
                //     roomSlide.style.backgroundImage = `url('${roomData.photos[0]}')`;
                // }
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

    function initCountdown(currentUser) {
        const timerVal = document.getElementById('timer-val');
        const timerLabel = document.getElementById('timer-label');
        if (!timerVal || !timerLabel) return;
        if (currentUser.attendance_option === 'friday_arrival') {
            // Friday August 6th 2027 5:00 PM
            targetDate = new Date('2027-08-06T17:00:00');
            timerLabel.textContent = "Until The Garden Party";
        } else {
            // Thursday August 5th 2027 12:00 PM
            targetDate = new Date('2027-08-05T12:00:00');
            timerLabel.textContent = "Until The Weekend Starts";
        }
        updateTimer();
    }

    function updateTimer() {
        const timerVal = document.getElementById('timer-val');
        const timerLabel = document.getElementById('timer-label');
        if (!timerVal || !timerLabel || !targetDate) return;

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

    // Initialize countdown if DOM elements are present
    if (document.getElementById('timer-val') && document.getElementById('timer-label')) {
        initCountdown(user);
        setInterval(updateTimer, 1000);
    }

    // C. Itinerary Text Update
    function initNextEvent(currentUser) {
        const nextEventName = document.getElementById('next-event-name');
        if (nextEventName) {
            if (currentUser.attendance_option === 'friday_arrival') {
                nextEventName.textContent = "Fri 1pm: Pimms & Games";
            } else {
                nextEventName.textContent = "Thu 6pm: Pizza & Drinks";
            }
        }
    }
    initNextEvent(user);

    // D. Initialize Swiper (3D Coverflow)
    // D. Initialize Swiper (3D Coverflow)
    // D. Initialize Swiper (3D Coverflow)
    const swiper = new Swiper('#dashboard-swiper', {
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
    window.mySwiperInstance = swiper;

    // Global helper to navigate dashboard from chatbot actions
    window.navigateDashboard = function (target) {
        // Close FAQ modal
        const faqModal = document.getElementById('faq-modal');
        if (faqModal) {
            faqModal.classList.remove('open');
        }

        // Slight delay for smooth transition after modal closes
        setTimeout(() => {
            const swiperInstance = window.mySwiperInstance;
            if (!swiperInstance) return;

            // Find slide index by element ID
            let elementId = `slide-${target}`;
            if (target === 'gallery') elementId = 'slide-photos'; // map 'gallery' action to 'slide-photos' element

            const slideEl = document.getElementById(elementId);
            if (slideEl) {
                const slideIndex = parseInt(slideEl.getAttribute('data-swiper-slide-index'));
                if (!isNaN(slideIndex)) {
                    swiperInstance.slideToLoop(slideIndex);
                }
            }

            // Trigger corresponding modals or actions
            if (target === 'room') {
                if (user && user.room_assigned) {
                    const normalizedRoom = user.room_assigned.replace(/'/g, '’');
                    const roomData = window.ROOM_LIBRARY ? (window.ROOM_LIBRARY[user.room_assigned] || window.ROOM_LIBRARY[normalizedRoom]) : null;
                    if (roomData && typeof openRoomModal === 'function') {
                        openRoomModal(roomData, user.room_assigned, user.room_status, user.access_code);
                    }
                }
            } else if (target === 'itinerary') {
                const btn = document.getElementById('btn-view-schedule');
                if (btn) btn.click();
            } else if (target === 'estate') {
                const btn = document.getElementById('btn-explore-estate');
                if (btn) btn.click();
            } else if (target === 'gallery') {
                const btn = document.getElementById('btn-view-shared-gallery');
                if (btn) btn.click();
            } else if (target === 'rsvp') {
                const btn = document.getElementById('btn-update-rsvp');
                if (btn) btn.click();
            }
        }, 300);
    };


    // E. Itinerary Modal Logic
    const modal = document.getElementById('itinerary-modal');
    const btnViewSchedule = document.getElementById('btn-view-schedule');
    const closeBtn = document.querySelector('#itinerary-modal .close-modal'); // Specific Selector

    // Itinerary Modal States (declared early at top of DOMContentLoaded)

    function updateItineraryBackground(timeStr) {
        const modalContent = document.querySelector('#itinerary-modal .modal-content');
        if (!modalContent) return;
        if (!timeStr) return;
        
        const timeLower = timeStr.toLowerCase();
        if (timeLower.includes('am') || timeLower.includes('8:') || timeLower.includes('9:') || timeLower.includes('11:')) {
            // Morning (Soft Peach/Cream Sunrise)
            modalContent.style.background = 'linear-gradient(180deg, rgba(253, 251, 247, 0.98) 0%, rgba(254, 243, 199, 0.9) 100%)';
        } else if (timeLower.includes('pm') && (timeLower.includes('12:') || timeLower.includes('1:') || timeLower.includes('2:') || timeLower.includes('3:') || timeLower.includes('4:') || timeLower.includes('5:'))) {
            // Afternoon (Sky Blue/Teal Refresh)
            modalContent.style.background = 'linear-gradient(180deg, rgba(253, 251, 247, 0.98) 0%, rgba(191, 219, 254, 0.8) 100%)';
        } else {
            // Evening/Night (Deep Indigo Night)
            modalContent.style.background = 'linear-gradient(180deg, rgba(253, 251, 247, 0.98) 0%, rgba(30, 27, 75, 0.45) 100%)';
        }
        modalContent.style.transition = 'background 0.5s ease-out';
    }

    // NEW: Render Itinerary Function
    function renderItineraryContent(currentUser) {
        const timelineContainer = document.querySelector('.itinerary-scroll-container');
        const schedule = window.itinerarySchedule; // Get global data

        if (!timelineContainer || !schedule) return;

        // Date labels mapping
        const dayLabels = {
            "Thursday": "Thursday, August 5th",
            "Friday": "Friday, August 6th",
            "Saturday": "Saturday, August 7th",
            "Sunday": "Sunday, August 8th"
        };

        // Filter days based on attendance: Friday arrival hides Thursday; Ceremony only displays Saturday only.
        const days = schedule.filter(d => {
            if (!currentUser) return true;
            if (currentUser.attendance_option === 'friday_arrival') {
                return d.day !== 'Thursday';
            }
            if (currentUser.attendance_option === 'ceremony_only') {
                return d.day === 'Saturday';
            }
            return true;
        });
        
        // Ensure active day is valid
        if (!days.some(d => d.day === itineraryActiveDay)) {
            itineraryActiveDay = days[0] ? days[0].day : 'Friday';
        }

        const activeDaySchedule = days.find(d => d.day === itineraryActiveDay);
        const dayEvents = activeDaySchedule ? activeDaySchedule.events : [];

        let controlsHtml = `
            <div class="itinerary-wrapper">
                <!-- Day Tabs and Toggle row -->
                <div class="itinerary-controls" style="display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1.25rem;">
                    <div class="itinerary-day-tabs" style="display: flex; gap: 0.4rem; background: rgba(193, 162, 122, 0.1); padding: 0.35rem; border-radius: 50px; border: 1px solid rgba(193, 162, 122, 0.15); width: 100%; box-sizing: border-box; justify-content: space-around;">
        `;
        
        days.forEach(d => {
            const isActive = d.day === itineraryActiveDay;
            controlsHtml += `
                <button class="floor-tab itinerary-day-tab ${isActive ? 'active' : ''}" data-day="${d.day}" style="flex: 1; text-align: center; font-size: 0.85rem; padding: 0.4rem 0.6rem; border: none; cursor: pointer; transition: all 0.2s; border-radius: 25px;">
                    ${d.day.substring(0, 3)}
                </button>
            `;
        });        controlsHtml += `
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 0 0.25rem;">
                         <span id="itinerary-date-label" style="font-family: 'Playfair Display', serif; font-size: 1.15rem; color: var(--text-main); font-weight: 700;">
                             ${dayLabels[itineraryActiveDay]}
                         </span>
                         <div style="display: flex; gap: 0.4rem; align-items: center;">
                             ${itineraryViewMode === 'storybook' ? `
                                 <button id="itinerary-prev-arrow" class="itinerary-nav-btn" style="box-shadow: 0 2px 6px rgba(0,0,0,0.05);" title="Previous">
                                     <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="display: block; margin: auto;"><polyline points="15 18 9 12 15 6"></polyline></svg>
                                 </button>
                                 <button id="itinerary-next-arrow" class="itinerary-nav-btn" style="box-shadow: 0 2px 6px rgba(0,0,0,0.05);" title="Next">
                                     <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="display: block; margin: auto;"><polyline points="9 18 15 12 9 6"></polyline></svg>
                                 </button>
                             ` : ''}
                             <button id="btn-itinerary-toggle" class="btn-card-action" style="margin: 0; padding: 0.4rem 0.8rem; font-size: 0.8rem; border-color: var(--primary); color: var(--primary); background: transparent; border-radius: 50px; cursor: pointer; font-weight: 600;">
                                 ${itineraryViewMode === 'storybook' ? '🔍 Zoom Out (List)' : '📖 Zoom In (Story)'}
                             </button>
                         </div>
                    </div>
                </div>

                <!-- Active Content Container -->
                <div id="itinerary-active-content" style="transition: all 0.3s ease;">
        `;

        if (itineraryViewMode === 'storybook') {
            // Storybook Swiper HTML
            controlsHtml += `
                <div class="swiper swiper-itinerary" style="width: 100%; height: 380px; border-radius: 20px; position: relative; box-sizing: border-box;">
                    <div class="swiper-wrapper">
            `;
            
            dayEvents.forEach((event, idx) => {
                controlsHtml += `
                    <div class="swiper-slide" data-time="${event.time}">
                        <div class="itinerary-storybook-card" style="position: relative; border-radius: 20px; overflow: hidden; height: 100%; box-shadow: 0 10px 30px rgba(0,0,0,0.12); display: flex; flex-direction: column; justify-content: flex-end; background: #eee;">
                            <img src="${event.image || 'huntsham_exterior.jpg'}" onclick="window.openItineraryLightbox('${event.image || 'huntsham_exterior.jpg'}', '${event.summary.replace(/'/g, "\\'")}')" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; z-index: 1; cursor: pointer;">
                            <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.15) 60%, rgba(0,0,0,0.3) 100%); z-index: 2;"></div>
                            
                            <!-- Fullscreen zoom button -->
                            <div class="itinerary-fullscreen-btn" onclick="window.openItineraryLightbox('${event.image || 'huntsham_exterior.jpg'}', '${event.summary.replace(/'/g, "\\'")}')" style="position: absolute; top: 1.25rem; right: 1.25rem; z-index: 3; width: 36px; height: 36px; border-radius: 50%; background: rgba(255,255,255,0.25); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,0.3); display: flex; justify-content: center; align-items: center; cursor: pointer; color: white; font-size: 1.1rem; text-shadow: 0 1px 2px rgba(0,0,0,0.3); transition: background 0.2s;">
                                🔍
                            </div>
                            
                            <!-- Header Time/Location Overlay -->
                            <div style="position: absolute; top: 1.25rem; left: 1.25rem; z-index: 3; display: flex; flex-direction: column; gap: 0.25rem; text-align: left;">
                                <span style="background: rgba(255, 255, 255, 0.25); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,0.3); color: white; padding: 0.3rem 0.8rem; border-radius: 50px; font-size: 0.8rem; font-weight: 700; width: fit-content; text-shadow: 0 1px 2px rgba(0,0,0,0.3);">${event.time}</span>
                                <span style="color: rgba(255, 255, 255, 0.95); font-size: 0.85rem; font-weight: 600; text-shadow: 0 1px 2px rgba(0,0,0,0.4);">📍 ${event.location}</span>
                            </div>
                            
                            <!-- Content Overlay -->
                            <div style="position: relative; z-index: 3; padding: 1.5rem; color: white; text-align: left;">
                                <h3 style="font-family: 'Playfair Display', serif; font-size: 1.6rem; font-weight: 600; margin-bottom: 0.5rem; text-shadow: 0 1px 3px rgba(0,0,0,0.5);">${event.summary}</h3>
                                <p style="font-family: 'Montserrat', sans-serif; font-size: 0.85rem; line-height: 1.45; color: rgba(255, 255, 255, 0.9); margin: 0; text-shadow: 0 1px 2px rgba(0,0,0,0.4);">${event.details || 'No details available.'}</p>
                            </div>
                        </div>
                    </div>
                `;
            });
            
            controlsHtml += `
                    </div>
                    <div class="swiper-pagination"></div>
                </div>
            `;
        } else {
            // Overview List HTML
            controlsHtml += `
                <div class="itinerary-overview-list" style="display: flex; flex-direction: column; gap: 0.8rem; text-align: left;">
            `;
            
            dayEvents.forEach((event, idx) => {
                controlsHtml += `
                    <div class="itinerary-overview-card" data-index="${idx}" style="display: flex; gap: 1rem; background: white; border: 1px solid rgba(193, 162, 122, 0.2); padding: 0.75rem; border-radius: 16px; cursor: pointer; transition: all 0.2s; box-shadow: 0 2px 8px rgba(0,0,0,0.02); align-items: center;">
                        <img src="${event.image || 'huntsham_exterior.jpg'}" onclick="event.stopPropagation(); window.openItineraryLightbox('${event.image || 'huntsham_exterior.jpg'}', '${event.summary.replace(/'/g, "\\'")}')" style="width: 65px; height: 65px; object-fit: cover; border-radius: 12px; border: 1px solid rgba(193, 162, 122, 0.15); flex-shrink: 0; cursor: pointer;">
                        <div style="flex: 1; min-width: 0;">
                            <span style="color: var(--primary); font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 0.15rem;">${event.time} • ${event.location}</span>
                            <h4 style="font-family: 'Playfair Display', serif; font-size: 1.1rem; color: var(--text-main); margin-bottom: 0.15rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600;">${event.summary}</h4>
                            <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${event.details || ''}</p>
                        </div>
                        <span style="color: var(--primary); font-size: 1.2rem; flex-shrink: 0; padding-right: 0.25rem;">›</span>
                    </div>
                `;
            });
            
            controlsHtml += `
                </div>
            `;
        }

        controlsHtml += `
                </div>
            </div>
        `;

        timelineContainer.innerHTML = controlsHtml;

        // Setup Event Listeners
        const dayButtons = timelineContainer.querySelectorAll('.itinerary-day-tab');
        dayButtons.forEach(btn => {
            btn.onclick = () => {
                itineraryActiveDay = btn.getAttribute('data-day');
                renderItineraryContent(currentUser);
            };
        });

        const toggleBtn = timelineContainer.querySelector('#btn-itinerary-toggle');
        if (toggleBtn) {
            toggleBtn.onclick = () => {
                itineraryViewMode = itineraryViewMode === 'storybook' ? 'overview' : 'storybook';
                renderItineraryContent(currentUser);
            };
        }

        if (itineraryViewMode === 'storybook' && dayEvents.length > 0) {
            // Initialize Swiper
            setTimeout(() => {
                if (itinerarySwiper) {
                    itinerarySwiper.destroy(true, true);
                }
                itinerarySwiper = new Swiper('.swiper-itinerary', {
                    pagination: { el: '.swiper-itinerary .swiper-pagination', clickable: true },
                    navigation: { nextEl: '#itinerary-next-arrow', prevEl: '#itinerary-prev-arrow' },
                    loop: false,
                    observer: true,
                    observeParents: true,
                    on: {
                        init: function () {
                            const activeSlide = this.slides[this.activeIndex];
                            if (activeSlide) {
                                const time = activeSlide.getAttribute('data-time');
                                updateItineraryBackground(time);
                            }
                        },
                        slideChange: function () {
                            const activeSlide = this.slides[this.activeIndex];
                            if (activeSlide) {
                                const time = activeSlide.getAttribute('data-time');
                                updateItineraryBackground(time);
                            }
                        }
                    }
                });
            }, 0);
        } else {
            // Overview card click events
            const overviewCards = timelineContainer.querySelectorAll('.itinerary-overview-card');
            overviewCards.forEach(card => {
                card.onclick = () => {
                    const idx = parseInt(card.getAttribute('data-index'));
                    itineraryViewMode = 'storybook';
                    
                    // Render first
                    renderItineraryContent(currentUser);
                    
                    // Set active slide
                    setTimeout(() => {
                        if (itinerarySwiper) {
                            itinerarySwiper.slideTo(idx);
                        }
                    }, 50);
                };
            });
            
            // Clean modal background for Overview Mode (standard cream)
            const modalContent = document.querySelector('#itinerary-modal .modal-content');
            if (modalContent) {
                modalContent.style.background = 'rgba(253, 251, 247, 0.95)';
            }
        }
    }

    // Open Modal
    if (btnViewSchedule) {
        btnViewSchedule.addEventListener('click', () => {
            modal.classList.add('open');
            const currentUser = JSON.parse(localStorage.getItem('user'));
            // Reset state on open
            itineraryActiveDay = 'Thursday';
            if (currentUser) {
                if (currentUser.attendance_option === 'friday_arrival') {
                    itineraryActiveDay = 'Friday';
                } else if (currentUser.attendance_option === 'ceremony_only') {
                    itineraryActiveDay = 'Saturday';
                }
            }
            itineraryViewMode = 'storybook';
            renderItineraryContent(currentUser);
        });
    }

    // Close Modal (X button)
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.classList.remove('open');
            const modalContent = document.querySelector('#itinerary-modal .modal-content');
            if (modalContent) {
                modalContent.style.background = '';
            }
        });
    }

    // Close Modal (Click Background)
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('open');
            const modalContent = document.querySelector('#itinerary-modal .modal-content');
            if (modalContent) {
                modalContent.style.background = '';
            }
        }
        if (e.target === faqModal) {
            faqModal.classList.remove('open');
        }
        if (e.target === rsvpModal) {
            closeRsvpModal();
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

        // Helper to parse basic inline markdown (**bold**, [text](url), etc.)
        const parseInlineMarkdown = (text) => {
            return text
                .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                .replace(/\*([^*]+)\*/g, '<em>$1</em>')
                .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color:var(--primary);text-decoration:underline;">$1</a>');
        };

        const lines = content.split('\n');
        let html = '';
        let inAnswer = false;

        lines.forEach(line => {
            const trimmed = line.trim();
            if (trimmed.startsWith('# ')) {
                // Main Title - skip
                return;
            }
            
            if (trimmed.startsWith('## ')) {
                // Category Header
                if (inAnswer) {
                    html += `</div></details>`;
                    inAnswer = false;
                }
                const category = trimmed.replace('## ', '').trim();
                html += `<h3 class="faq-category-header" style="font-family:'Montserrat', sans-serif; font-size:1.15rem; font-weight:700; color:var(--text-main); margin-top:28px; margin-bottom:12px; border-bottom: 2px solid #F1F5F9; padding-bottom:6px;">${category}</h3>`;
            } else if (trimmed.startsWith('### ')) {
                // Question
                if (inAnswer) {
                    html += `</div></details>`;
                }
                const question = trimmed.replace('### ', '').trim();
                html += `<details class="faq-item"><summary>${question}</summary><div class="faq-answer">`;
                inAnswer = true;
            } else if (inAnswer) {
                if (trimmed.length > 0) {
                    if (trimmed.startsWith('* ') || trimmed.startsWith('- ') || trimmed.startsWith('*')) {
                        // Unordered list item
                        const itemText = trimmed.replace(/^[\*\-]\s*/, '').trim();
                        html += `<li style="margin-left:16px; margin-bottom:6px; font-size:0.925rem; list-style-type:disc;">${parseInlineMarkdown(itemText)}</li>`;
                    } else {
                        // Standard paragraph
                        html += `<p style="margin-bottom:12px; font-size:0.925rem; line-height:1.5;">${parseInlineMarkdown(trimmed)}</p>`;
                    }
                }
            }
        });
        
        if (inAnswer) {
            html += `</div></details>`;
        }

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
        if (isBot) {
            // Replace [Link Text](action://target) with HTML link triggering navigateDashboard
            let html = text.replace(/\[([^\]]+)\]\(action:\/\/([a-zA-Z0-9_-]+)\)/g, (match, linkText, action) => {
                return `<a href="#" onclick="window.navigateDashboard('${action}'); return false;" style="color: var(--primary); text-decoration: underline; font-weight: 600;">${linkText}</a>`;
            });
            bubble.innerHTML = html;
        } else {
            bubble.textContent = text;
        }
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

        let roomData = null;
        if (user && user.room_assigned && window.ROOM_LIBRARY) {
            const normalizedRoom = user.room_assigned.replace(/'/g, '’');
            roomData = window.ROOM_LIBRARY[user.room_assigned] || window.ROOM_LIBRARY[normalizedRoom];
        }

        const reqBody = {
            query: query,
            guest: user ? {
                name: user.full_name,
                attendance: user.attendance_option,
                dietary: user.dietary_requirements,
                room_assigned: user.room_assigned,
                room_status: user.room_status
            } : null,
            roomDetails: roomData ? 
                `Room: ${user.room_assigned}\nDescription: ${roomData.description || ''}\nFloor: ${roomData.floor || ''}` : null,
            itinerary: window.itinerarySchedule || null
        };

        supabase.functions.invoke('gemini-faq', {
            body: reqBody
        })
            .then(({ data, error }) => {
                if (error) {
                    loadingBubble.remove();
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

    window.openPaymentModal = async function (roomName, accessCode) {
        if (!payModal) return;
        document.getElementById('pay-room-name').textContent = roomName;
        document.getElementById('pay-ref').textContent = accessCode;

        // Fetch room cost from database
        const costContainer = document.getElementById('payment-cost-container');
        if (costContainer) {
            costContainer.style.display = 'none'; // hide until loaded
            try {
                // Try 1: rooms table, name column
                let roomData = null;
                let res = await supabase.from('rooms').select('*').eq('name', roomName).single();
                if (res.data) roomData = res.data;
                else {
                    // Try 2: rooms table, room_name column
                    res = await supabase.from('rooms').select('*').eq('room_name', roomName).single();
                    if (res.data) roomData = res.data;
                }

                const countRes = await supabase.from('guests').select('id', { count: 'exact', head: true }).eq('room_assigned', roomName);
                
                if (roomData) {
                    const price = roomData.price_per_night ?? roomData.price ?? 0;
                    const nights = roomData.nights ?? 3;
                    const totalCost = price * nights;
                    const occupantCount = countRes.count || 1;
                    const costPerPerson = totalCost / occupantCount;

                    const btnTotal = document.getElementById('btn-cost-total');
                    const btnPerson = document.getElementById('btn-cost-person');
                    const costAmount = document.getElementById('cost-amount');
                    const costLabel = document.getElementById('cost-label');
                    const occupantsNote = document.getElementById('occupants-note');

                    if (btnTotal && btnPerson && costAmount && costLabel && occupantsNote) {
                        // Reset buttons
                        btnTotal.style.background = 'white';
                        btnTotal.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                        btnTotal.style.color = '#374151';
                        btnPerson.style.background = 'transparent';
                        btnPerson.style.boxShadow = 'none';
                        btnPerson.style.color = '#6b7280';

                        costAmount.textContent = `£${totalCost.toLocaleString()}`;
                        costLabel.textContent = `total room cost (${nights} nights)`;
                        occupantsNote.textContent = `Based on ${occupantCount} room occupants (£${costPerPerson.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} each)`;
                        occupantsNote.style.display = 'none';

                        btnTotal.onclick = () => {
                            btnTotal.style.background = 'white';
                            btnTotal.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                            btnTotal.style.color = '#374151';
                            btnPerson.style.background = 'transparent';
                            btnPerson.style.boxShadow = 'none';
                            btnPerson.style.color = '#6b7280';
                            
                            costAmount.textContent = `£${totalCost.toLocaleString()}`;
                            costLabel.textContent = `total room cost (${nights} nights)`;
                            occupantsNote.style.display = 'none';
                        };

                        btnPerson.onclick = () => {
                            btnPerson.style.background = 'white';
                            btnPerson.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                            btnPerson.style.color = '#374151';
                            btnTotal.style.background = 'transparent';
                            btnTotal.style.boxShadow = 'none';
                            btnTotal.style.color = '#6b7280';
                            
                            costAmount.textContent = `£${costPerPerson.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
                            costLabel.textContent = `per person share`;
                            if (occupantCount > 1) {
                                occupantsNote.style.display = 'block';
                            }
                        };

                        costContainer.style.display = 'block';

                        // Pre-select based on user setting
                        if (user && !user.shares_room_payment) {
                            btnPerson.click();
                        } else {
                            btnTotal.click();
                        }
                    }
                }
            } catch (err) {
                console.error("Failed to load payment pricing details:", err);
            }
        }

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

        // Compile Amenities dynamically based on description keywords (coffee and linens/toiletries removed as requested)
        const amenities = [
            "📶 High-speed Wi-Fi",
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

        // Toiletries Note
        const toiletriesNoteHtml = `
            <p class="suite-note">
                <span style="font-weight:600;">Please note:</span> Toiletries are not provided, so please remember to bring your own!
            </p>
        `;

        // Lodge Driveway Note
        let drivewayNoteHtml = '';
        if (roomName.toLowerCase().includes('lodge')) {
            drivewayNoteHtml = `
                <div class="lodge-note">
                    <span style="font-size: 1.2rem; line-height: 1;">ℹ️</span>
                    <span>Please note: Little Lodge and Gate House Lodge are located at the end of the driveway.</span>
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
                
                ${toiletriesNoteHtml}
                ${drivewayNoteHtml}
                
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

        // Clean up any existing orphaned map wrapper or placeholder from previous sessions
        const existingPlaceholder = document.getElementById('map-wrapper-placeholder');
        if (existingPlaceholder) existingPlaceholder.remove();
        const orphanedMaps = document.querySelectorAll('body > #map-wrapper-container');
        orphanedMaps.forEach(m => m.remove());

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

                <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.8rem; font-style: italic; text-align: center; line-height: 1.4;">
                    💡 Tip: Tap the map or the <strong>Fullscreen ⛶</strong> button to zoom & pan the floor plans on mobile screens.
                </p>

                <!-- Map Container -->
                <div class="map-wrapper" id="map-wrapper-container" style="padding: 1rem; box-sizing: border-box;">
                     <div class="map-header-bar" style="display: flex; justify-content: center; align-items: center; margin-bottom: 1rem; width: 100%;">
                          <div class="floor-tabs" id="floor-tabs" style="margin-bottom: 0; width: 100%; display: flex; justify-content: space-around;">
                               <button class="floor-tab active" data-floor="0">Ground</button>
                               <button class="floor-tab" data-floor="1">First</button>
                               <button class="floor-tab" data-floor="2">Second</button>
                          </div>
                     </div>

                     <div class="map-scroll-container" id="map-scroll" style="position: relative; overflow: hidden;">
                          <!-- Floating Controls Pinned to Top-Right -->
                          <button id="btn-map-fullscreen" class="btn-card-action" style="position: absolute; top: 12px; right: 12px; z-index: 100; margin: 0; padding: 0; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(253, 251, 247, 0.95); border: 1px solid rgba(193, 162, 122, 0.45); color: var(--primary); box-shadow: 0 4px 10px rgba(0,0,0,0.12); cursor: pointer; font-size: 1.1rem; transition: all 0.2s;">
                              ⛶
                          </button>
                          <button id="btn-close-map-fullscreen" class="btn-card-action" style="display: none; position: absolute; top: 12px; right: 12px; z-index: 100; margin: 0; padding: 0; width: 40px; height: 40px; border-radius: 50%; align-items: center; justify-content: center; background: var(--primary); color: white; border: none; box-shadow: 0 4px 12px rgba(0,0,0,0.25); cursor: pointer; font-size: 1rem; transition: all 0.2s;">
                              ✕
                          </button>

                          <div class="map-zoom-area" style="position: relative; display: inline-block; width: 100%; transform-origin: 0 0;">
                               <img id="floor-map-img" class="floor-map-img" src="https://jkxxswxpykdyrpjriizx.supabase.co/storage/v1/object/public/floor-plan/Groundfloor.png" alt="Floor Plan" style="width: 100%; transform-origin: 0 0;">
                               <div id="map-markers" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"></div>
                          </div>
                     </div>

                     <!-- Floating Zoom Controls (Visible in fullscreen mode) -->
                     <div class="map-zoom-controls" style="display: none; position: absolute; bottom: 24px; right: 24px; z-index: 12000; flex-direction: column; gap: 8px;">
                          <button id="btn-map-zoom-in" class="btn-card-action" style="margin: 0; padding: 0; width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(253, 251, 247, 0.95); border: 1px solid rgba(193, 162, 122, 0.45); color: var(--primary); box-shadow: 0 4px 12px rgba(0,0,0,0.15); cursor: pointer; font-size: 1.4rem; font-weight: bold; transition: all 0.2s;">+</button>
                          <button id="btn-map-zoom-out" class="btn-card-action" style="margin: 0; padding: 0; width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(253, 251, 247, 0.95); border: 1px solid rgba(193, 162, 122, 0.45); color: var(--primary); box-shadow: 0 4px 12px rgba(0,0,0,0.15); cursor: pointer; font-size: 1.4rem; font-weight: bold; transition: all 0.2s;">−</button>
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
                            el.textContent = 'Your room';
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

        // Zoom Logic
        let currentZoom = 100; // in percent
        const mapZoomArea = mapWrapper.querySelector('.map-zoom-area');

        const applyZoom = (zoomVal) => {
            currentZoom = Math.min(Math.max(zoomVal, 100), 300);
            if (mapZoomArea) {
                mapZoomArea.style.setProperty('width', `${currentZoom}%`, 'important');
            }
        };

        const zoomIn = () => {
            applyZoom(currentZoom + 40);
        };

        const zoomOut = () => {
            applyZoom(currentZoom - 40);
        };

        const enterFullscreen = () => {
            if (mapWrapper.classList.contains('fullscreen-active')) return;
            
            // Create and insert placeholder
            const placeholder = document.createElement('div');
            placeholder.id = 'map-wrapper-placeholder';
            mapWrapper.parentNode.insertBefore(placeholder, mapWrapper);
            
            // Move map wrapper to body to escape container containing-block (backdrop-filter)
            document.body.appendChild(mapWrapper);
            mapWrapper.classList.add('fullscreen-active');
            popover.classList.remove('visible');
            applyZoom(100); // Fit-to-screen initially
        };

        const exitFullscreen = () => {
            if (!mapWrapper.classList.contains('fullscreen-active')) return;
            
            // Reset zoom
            applyZoom(100);

            // Move map wrapper back from body
            const placeholder = document.getElementById('map-wrapper-placeholder');
            if (placeholder) {
                placeholder.parentNode.insertBefore(mapWrapper, placeholder);
                placeholder.remove();
            }
            
            mapWrapper.classList.remove('fullscreen-active');
            popover.classList.remove('visible');
        };

        if (btnFullscreen && mapWrapper) {
            btnFullscreen.onclick = (e) => {
                e.stopPropagation();
                enterFullscreen();
            };
        }

        if (btnCloseFullscreen && mapWrapper) {
            btnCloseFullscreen.onclick = (e) => {
                e.stopPropagation();
                exitFullscreen();
            };
        }

        // Zoom Buttons Listeners
        const btnZoomIn = document.getElementById('btn-map-zoom-in');
        const btnZoomOut = document.getElementById('btn-map-zoom-out');

        if (btnZoomIn) {
            btnZoomIn.onclick = (e) => {
                e.stopPropagation();
                zoomIn();
            };
        }

        if (btnZoomOut) {
            btnZoomOut.onclick = (e) => {
                e.stopPropagation();
                zoomOut();
            };
        }

        // Pinch-to-zoom logic
        let initialPinchDistance = 0;
        let initialPinchZoom = 100;

        if (mapScroll) {
            mapScroll.addEventListener('touchstart', (e) => {
                if (e.touches.length === 2 && mapWrapper.classList.contains('fullscreen-active')) {
                    const dx = e.touches[0].clientX - e.touches[1].clientX;
                    const dy = e.touches[0].clientY - e.touches[1].clientY;
                    initialPinchDistance = Math.hypot(dx, dy);
                    initialPinchZoom = currentZoom;
                }
            }, { passive: true });

            mapScroll.addEventListener('touchmove', (e) => {
                if (e.touches.length === 2 && mapWrapper.classList.contains('fullscreen-active') && initialPinchDistance > 0) {
                    const dx = e.touches[0].clientX - e.touches[1].clientX;
                    const dy = e.touches[0].clientY - e.touches[1].clientY;
                    const distance = Math.hypot(dx, dy);
                    const factor = distance / initialPinchDistance;
                    
                    const newZoom = initialPinchZoom * factor;
                    applyZoom(newZoom);
                }
            }, { passive: true });

            mapScroll.addEventListener('touchend', (e) => {
                if (e.touches.length < 2) {
                    initialPinchDistance = 0;
                }
            }, { passive: true });
        }

        // Click map to close popover
        if (mapScroll) {
            mapScroll.onclick = (e) => {
                const isHotspot = e.target.classList.contains('map-hotspot') || e.target.classList.contains('room-pin') || e.target.classList.contains('user-pin');
                if (!isHotspot) {
                    popover.classList.remove('visible');
                    
                    // On mobile, clicking the map background toggles fullscreen
                    if (window.innerWidth <= 768) {
                        enterFullscreen();
                    }
                }
            };
        }

        // Initial Render
        renderMarkers();
    };

    if (btnExploreEstate) {
        btnExploreEstate.addEventListener('click', () => {
            window.openEstateModal();
        });
    }

    // --- Photo Gallery Logic ---
    const sharedGalleryModal = document.getElementById('shared-gallery-modal');
    const btnViewSharedGallery = document.getElementById('btn-view-shared-gallery');
    const closeSharedGalleryBtn = document.querySelector('.close-shared-gallery');
    const btnRsvpGalleryUpload = document.getElementById('btn-rsvp-gallery-upload');
    let fullscreenSwiper = null;

    function canDeletePhotos() {
        const user = window.Auth.user;
        if (!user || !user.full_name) return false;
        const name = user.full_name.trim().toLowerCase();
        return name === 'harry parker' || name === 'rosh timoney';
    }

    async function deleteSharedPhoto(guestId, photoUrlToDelete) {
        if (!confirm("Are you sure you want to delete this photo from the shared gallery?")) return;

        try {
            // Fetch guest's current photos first
            const { data: guestData, error: fetchError } = await supabase
                .from('guests')
                .select('photo_url')
                .eq('id', guestId)
                .single();

            if (fetchError) throw fetchError;

            let currentUrls = getPhotoUrls(guestData.photo_url);
            const updatedUrls = currentUrls.filter(url => url !== photoUrlToDelete);

            const serialized = updatedUrls.length > 0 ? JSON.stringify(updatedUrls) : null;

            const { error: updateError } = await supabase
                .from('guests')
                .update({ photo_url: serialized })
                .eq('id', guestId);

            if (updateError) throw updateError;

            alert("Photo successfully deleted.");
            loadSharedGallery();

        } catch (err) {
            console.error('Failed to delete photo:', err);
            alert('Failed to delete photo: ' + err.message);
        }
    }

    async function loadSharedGallery() {
        const grid = document.getElementById('shared-photos-grid');
        if (!grid) return;

        grid.innerHTML = '<p class="loading-photos" style="text-align: center; color: var(--text-muted); padding: 2rem; grid-column: 1 / -1;">Loading gallery...</p>';

        try {
            // Query secure shared_gallery view
            const { data, error } = await supabase
                .from('shared_gallery')
                .select('id, full_name, photo_url');

            if (error) throw error;

            let photoItems = [];
            data.forEach(row => {
                if (row.photo_url) {
                    const urls = getPhotoUrls(row.photo_url);
                    urls.forEach(url => {
                        photoItems.push({
                            url: url,
                            guestId: row.id,
                            guestName: row.full_name
                        });
                    });
                }
            });

            grid.innerHTML = '';

            if (photoItems.length === 0) {
                grid.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 2rem; grid-column: 1 / -1;">No photos shared yet. Be the first to share one!</p>';
                return;
            }

            const isAdmin = canDeletePhotos();

            photoItems.forEach((item, index) => {
                const card = document.createElement('div');
                card.className = 'shared-photo-card';
                card.style.position = 'relative';

                const img = document.createElement('img');
                img.src = item.url;
                img.alt = `Shared photo ${index + 1}`;
                img.loading = 'lazy';
                img.style.cursor = 'pointer';

                card.appendChild(img);

                img.onclick = () => {
                    openFullScreenGallery(photoItems.map(p => p.url), index);
                };

                if (isAdmin) {
                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = 'shared-photo-delete-btn';
                    deleteBtn.innerHTML = '🗑';
                    deleteBtn.title = `Delete photo uploaded by ${item.guestName}`;
                    deleteBtn.style.cssText = `
                        position: absolute;
                        top: 8px;
                        right: 8px;
                        background: rgba(239, 68, 68, 0.9);
                        color: white;
                        border: none;
                        border-radius: 50%;
                        width: 30px;
                        height: 30px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 0.95rem;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
                        z-index: 50;
                        transition: transform 0.2s, background 0.2s;
                    `;
                    deleteBtn.onmouseenter = () => deleteBtn.style.background = '#dc2626';
                    deleteBtn.onmouseleave = () => deleteBtn.style.background = 'rgba(239, 68, 68, 0.9)';
                    deleteBtn.onclick = (e) => {
                        e.stopPropagation();
                        deleteSharedPhoto(item.guestId, item.url);
                    };
                    card.appendChild(deleteBtn);
                }

                grid.appendChild(card);
            });

        } catch (err) {
            console.error('Failed to load shared gallery:', err);
            grid.innerHTML = '<p style="text-align: center; color: #ef4444; padding: 2rem; grid-column: 1 / -1;">Failed to load photos. Please try again later.</p>';
        }
    }

    function openFullScreenGallery(urls, startIndex) {
        if (!galleryModal) return;

        // Hide any room/estate detail content if present
        const roomContent = document.getElementById('room-detail-content');
        if (roomContent) roomContent.style.display = 'none';

        // Show the swiper gallery
        const swiperGallery = galleryModal.querySelector('.swiper-gallery');
        if (swiperGallery) swiperGallery.style.display = 'block';

        // Populate wrapper
        const wrapper = document.getElementById('gallery-wrapper');
        if (wrapper) {
            wrapper.innerHTML = urls.map(url => `
                <div class="swiper-slide" style="display: flex; align-items: center; justify-content: center; height: 100%;">
                    <img src="${url}" style="max-width: 90%; max-height: 90vh; object-fit: contain; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.5);">
                </div>
            `).join('');
        }

        // Show modal
        galleryModal.classList.add('open');

        // Initialize/Update Swiper
        setTimeout(() => {
            if (fullscreenSwiper) {
                fullscreenSwiper.destroy(true, true);
            }
            fullscreenSwiper = new Swiper('.swiper-gallery', {
                pagination: { el: '.swiper-gallery .swiper-pagination', clickable: true },
                navigation: { nextEl: '.swiper-gallery .swiper-button-next', prevEl: '.swiper-gallery .swiper-button-prev' },
                initialSlide: startIndex,
                loop: urls.length > 1,
                observer: true,
                observeParents: true
            });
        }, 0);
    }

    if (btnViewSharedGallery) {
        btnViewSharedGallery.addEventListener('click', () => {
            if (sharedGalleryModal) {
                sharedGalleryModal.classList.add('open');
                loadSharedGallery();
            }
        });
    }

    if (closeSharedGalleryBtn) {
        closeSharedGalleryBtn.addEventListener('click', () => {
            if (sharedGalleryModal) sharedGalleryModal.classList.remove('open');
        });
    }

    if (sharedGalleryModal) {
        sharedGalleryModal.addEventListener('click', (e) => {
            if (e.target === sharedGalleryModal) sharedGalleryModal.classList.remove('open');
        });
    }

    if (btnRsvpGalleryUpload) {
        btnRsvpGalleryUpload.addEventListener('click', () => {
            if (sharedGalleryModal) sharedGalleryModal.classList.remove('open');
            openRsvpModal();
            setTimeout(() => {
                const rsvpModal = document.getElementById('rsvp-modal');
                if (rsvpModal) {
                    const modalContent = rsvpModal.querySelector('.modal-content');
                    if (modalContent) {
                        modalContent.scrollTo({
                            top: modalContent.scrollHeight,
                            behavior: 'smooth'
                        });
                    }
                }
                const photoUploadSection = document.getElementById('rsvp-photoUpload');
                if (photoUploadSection) {
                    // Highlight flash effect
                    const parentGroup = photoUploadSection.closest('.form-group');
                    if (parentGroup) {
                        parentGroup.style.boxShadow = '0 0 0 5px rgba(193, 162, 122, 0.45)';
                        parentGroup.style.transition = 'box-shadow 0.4s ease';
                        setTimeout(() => {
                            parentGroup.style.boxShadow = '';
                        }, 2000);
                    }
                }
            }, 400);
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

    // --- Timetable Lightbox Logic ---
    const lightbox = document.getElementById('timetable-lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxTitle = document.getElementById('lightbox-title');
    const closeLightbox = document.getElementById('close-lightbox');
    
    const btnZoomIn = document.getElementById('btn-zoom-in');
    const btnZoomOut = document.getElementById('btn-zoom-out');
    const btnZoomReset = document.getElementById('btn-zoom-reset');
    
    let scale = 1;
    let translateX = 0;
    let translateY = 0;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    
    // For mobile pinch zoom
    let startDistance = 0;
    let startScale = 1;
    let isPinching = false;

    window.openItineraryLightbox = function(imageSrc, title) {
        if (!lightbox || !lightboxImg || !lightboxTitle) return;
        lightboxImg.src = imageSrc;
        lightboxTitle.textContent = title;
        scale = 1;
        translateX = 0;
        translateY = 0;
        updateTransform();
        lightbox.classList.add('open');
    };

    function closeLightboxFunc() {
        if (!lightbox) return;
        lightbox.classList.remove('open');
    }

    if (closeLightbox) {
        closeLightbox.addEventListener('click', closeLightboxFunc);
    }
    if (lightbox) {
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox || e.target === document.getElementById('lightbox-img-wrapper') || e.target.id === 'timetable-lightbox') {
                closeLightboxFunc();
            }
        });
    }

    function updateTransform() {
        if (lightboxImg) {
            lightboxImg.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
            if (scale > 1) {
                lightboxImg.style.cursor = 'grab';
            } else {
                lightboxImg.style.cursor = 'default';
            }
        }
    }

    if (btnZoomIn) {
        btnZoomIn.addEventListener('click', () => {
            scale = Math.min(scale + 0.5, 4);
            updateTransform();
        });
    }

    if (btnZoomOut) {
        btnZoomOut.addEventListener('click', () => {
            scale = Math.max(scale - 0.5, 1);
            if (scale === 1) {
                translateX = 0;
                translateY = 0;
            }
            updateTransform();
        });
    }

    if (btnZoomReset) {
        btnZoomReset.addEventListener('click', () => {
            scale = 1;
            translateX = 0;
            translateY = 0;
            updateTransform();
        });
    }

    // Dragging / Panning logic
    const imgWrapper = document.getElementById('lightbox-img-wrapper');
    if (imgWrapper && lightboxImg) {
        lightboxImg.addEventListener('mousedown', (e) => {
            if (scale <= 1) return;
            e.preventDefault();
            isDragging = true;
            startX = e.clientX - translateX;
            startY = e.clientY - translateY;
            lightboxImg.style.cursor = 'grabbing';
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            translateX = e.clientX - startX;
            translateY = e.clientY - startY;
            updateTransform();
        });

        window.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                if (lightboxImg) lightboxImg.style.cursor = 'grab';
            }
        });

        // Touch events for mobile dragging & pinch-to-zoom
        lightboxImg.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1 && scale > 1) {
                isDragging = true;
                startX = e.touches[0].clientX - translateX;
                startY = e.touches[0].clientY - translateY;
            } else if (e.touches.length === 2) {
                isDragging = false;
                isPinching = true;
                startDistance = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                startScale = scale;
            }
        });

        lightboxImg.addEventListener('touchmove', (e) => {
            if (isDragging && e.touches.length === 1) {
                translateX = e.touches[0].clientX - startX;
                translateY = e.touches[0].clientY - startY;
                updateTransform();
            } else if (isPinching && e.touches.length === 2) {
                e.preventDefault();
                const dist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                const factor = dist / startDistance;
                scale = Math.min(Math.max(startScale * factor, 1), 4);
                if (scale === 1) {
                    translateX = 0;
                    translateY = 0;
                }
                updateTransform();
            }
        });

        lightboxImg.addEventListener('touchend', (e) => {
            isDragging = false;
            isPinching = false;
        });
    }

    // --- MODAL WIZARD HELPER FUNCTIONS ---
    let modalCurrentStep = 1;

    function getModalVisiblePanes() {
        const visiblePanes = [1, 2];
        const choice = rsvpModalForm.querySelector('input[name="attendance_choice"]:checked');
        const hiddenInput = document.getElementById('rsvp-attendance-hidden-input');
        const isOnsite = user?.is_onsite_allowed;

        if (choice && choice.value === 'attend') {
            if (isOnsite) {
                visiblePanes.push(3);
            }
            visiblePanes.push(4);
            visiblePanes.push(5);
        } else if (!choice && hiddenInput && hiddenInput.value && hiddenInput.value !== 'decline') {
            if (isOnsite) {
                visiblePanes.push(3);
            }
            visiblePanes.push(4);
            visiblePanes.push(5);
        } else if (!choice && (!hiddenInput || !hiddenInput.value)) {
            if (isOnsite) {
                visiblePanes.push(3);
            }
            visiblePanes.push(4);
            visiblePanes.push(5);
        }
        return visiblePanes;
    }

    function showModalStepPane(stepIndex) {
        const visiblePanes = getModalVisiblePanes();
        
        // Hide all panes
        rsvpModalForm.querySelectorAll('.rsvp-step-pane').forEach(pane => {
            pane.classList.remove('active');
        });

        // Show target pane
        const targetPane = document.getElementById(`rsvp-pane-${stepIndex}`);
        if (targetPane) {
            targetPane.classList.add('active');
        }

        modalCurrentStep = stepIndex;

        // Update nav buttons
        const btnBack = document.getElementById('btn-rsvp-wizard-back');
        const btnNext = document.getElementById('btn-rsvp-wizard-next');

        const currentIdx = visiblePanes.indexOf(stepIndex);

        if (currentIdx === 0) {
            btnBack.style.opacity = '0.5';
            btnBack.style.cursor = 'not-allowed';
            btnBack.disabled = true;
        } else {
            btnBack.style.opacity = '1';
            btnBack.style.cursor = 'pointer';
            btnBack.disabled = false;
        }

        if (currentIdx === visiblePanes.length - 1) {
            btnNext.textContent = 'Finish & Dashboard';
        } else {
            btnNext.textContent = 'Next';
        }

        updateModalProgressBar();
    }

    function validateModalCurrentStep() {
        if (modalCurrentStep === 1) {
            const fullName = document.getElementById('rsvp-fullName');
            const phone = document.getElementById('rsvp-phone');
            if (fullName && !fullName.value.trim()) {
                alert("Please enter your full name.");
                fullName.focus();
                return false;
            }
            if (phone && !phone.value.trim()) {
                alert("Please enter your phone number.");
                phone.focus();
                return false;
            }
        }
        if (modalCurrentStep === 2) {
            const choice = rsvpModalForm.querySelector('input[name="attendance_choice"]:checked');
            if (!choice) {
                alert("Please select whether you will be attending.");
                return false;
            }
        }
        if (modalCurrentStep === 3) {
            const accommodationSelected = rsvpModalForm.querySelector('input[name="accommodation"]:checked');
            if (!accommodationSelected) {
                alert("Please select your accommodation preference.");
                return false;
            }
        }
        return true;
    }

    function updateModalProgressBar() {
        const modalContainer = document.getElementById('rsvp-modal');
        if (!modalContainer) return;

        const dots = Array.from(modalContainer.querySelectorAll('.rsvp-progress-step'));
        const visiblePanes = getModalVisiblePanes();
        const totalSteps = visiblePanes.length;

        let stepNumber = 1;
        dots.forEach(dot => {
            const paneId = parseInt(dot.getAttribute('data-step'));
            const isPaneVisible = visiblePanes.includes(paneId);

            if (isPaneVisible) {
                dot.style.display = 'flex';
                const dotCircle = dot.querySelector('.rsvp-progress-dot');
                if (dotCircle) dotCircle.textContent = stepNumber;

                const currentPaneIndex = visiblePanes.indexOf(modalCurrentStep);
                const thisPaneIndex = visiblePanes.indexOf(paneId);

                dot.classList.remove('active', 'completed');
                if (thisPaneIndex === currentPaneIndex) {
                    dot.classList.add('active');
                } else if (thisPaneIndex < currentPaneIndex) {
                    dot.classList.add('completed');
                }

                stepNumber++;
            } else {
                dot.style.display = 'none';
            }
        });

        // Update progress line width
        const currentPaneIndex = visiblePanes.indexOf(modalCurrentStep);
        const progressLine = document.getElementById('rsvp-wizard-progress-line');
        if (progressLine) {
            const percentage = totalSteps > 1 ? (currentPaneIndex / (totalSteps - 1)) * 100 : 0;
            progressLine.style.width = `${percentage}%`;
        }
    }

    function syncModalVisualSelections() {
        // Attendance Choice yes/no cards (Modal)
        const hiddenInput = document.getElementById('rsvp-attendance-hidden-input');
        if (hiddenInput) {
            const val = hiddenInput.value;
            const yesCard = document.getElementById('rsvp-card-attendance-yes');
            const noCard = document.getElementById('rsvp-card-attendance-decline');
            const yesRadio = rsvpModalForm.querySelector('input[name="attendance_choice"][value="attend"]');
            const noRadio = rsvpModalForm.querySelector('input[name="attendance_choice"][value="decline"]');
            const dateSection = document.getElementById('rsvp-date-selection-section');
            
            if (yesCard && noCard && yesRadio && noRadio) {
                if (val && val !== 'decline') {
                    yesRadio.checked = true;
                    noRadio.checked = false;
                    yesCard.classList.add('selected');
                    noCard.classList.remove('selected');
                    if (dateSection) dateSection.classList.remove('hidden');
                } else if (val === 'decline') {
                    yesRadio.checked = false;
                    noRadio.checked = true;
                    yesCard.classList.remove('selected');
                    noCard.classList.add('selected');
                    if (dateSection) dateSection.classList.add('hidden');
                } else {
                    // Empty/Unselected initial state!
                    yesRadio.checked = false;
                    noRadio.checked = false;
                    yesCard.classList.remove('selected');
                    noCard.classList.remove('selected');
                    if (dateSection) dateSection.classList.add('hidden');
                }
            }
        }

        // Accommodation
        rsvpModalForm.querySelectorAll('input[name="accommodation"]').forEach(r => {
            const card = r.closest('.rsvp-flash-card');
            if (card) {
                if (r.checked) {
                    card.classList.add('selected');
                } else {
                    card.classList.remove('selected');
                }
            }
        });

        // Drink prefs
        rsvpModalForm.querySelectorAll('input[name="drink_pref"]').forEach(cb => {
            const chip = cb.closest('.drink-chip');
            if (chip) {
                if (cb.checked) {
                    chip.classList.add('selected');
                } else {
                    chip.classList.remove('selected');
                }
            }
        });
    }

    function setupModalFlashCards() {
        // Accommodation change listener to update cards
        rsvpModalForm.querySelectorAll('input[name="accommodation"]').forEach(radio => {
            radio.addEventListener('change', () => {
                rsvpModalForm.querySelectorAll('input[name="accommodation"]').forEach(r => {
                    const card = r.closest('.rsvp-flash-card');
                    if (card) {
                        if (r.checked) card.classList.add('selected');
                        else card.classList.remove('selected');
                    }
                });
                triggerRsvpAutoSave();
            });
        });

        // Drink checkbox pills
        const drinkChips = rsvpModalForm.querySelectorAll('.drink-chip input[name="drink_pref"]');
        drinkChips.forEach(cb => {
            const chip = cb.closest('.drink-chip');
            if (cb.checked) {
                chip.classList.add('selected');
            }

            chip.addEventListener('click', (e) => {
                if (e.target.tagName === 'INPUT') return;
                
                cb.checked = !cb.checked;
                if (cb.checked) {
                    chip.classList.add('selected');
                } else {
                    chip.classList.remove('selected');
                }
                triggerRsvpAutoSave();
            });
        });

        // Make progress dots clickable
        const modalContainer = document.getElementById('rsvp-modal');
        if (modalContainer) {
            const dots = Array.from(modalContainer.querySelectorAll('.rsvp-progress-step'));
            dots.forEach(dot => {
                dot.style.cursor = 'pointer';
                dot.addEventListener('click', () => {
                    const targetStep = parseInt(dot.getAttribute('data-step'));
                    const visiblePanes = getModalVisiblePanes();
                    if (visiblePanes.includes(targetStep)) {
                        // Allow clicking back freely. If clicking forward, validate current step.
                        if (targetStep < modalCurrentStep || validateModalCurrentStep()) {
                            showModalStepPane(targetStep);
                        }
                    }
                });
            });
        }
    }

    function renderModalRoomTeaser(roomName) {
        const placeholder = document.getElementById('rsvp-room-teaser-placeholder');
        if (!placeholder) return;

        placeholder.innerHTML = '';
        placeholder.style.display = 'none';
        return;
    }

    function setupModalWizard() {
        const btnBack = document.getElementById('btn-rsvp-wizard-back');
        const btnNext = document.getElementById('btn-rsvp-wizard-next');

        if (btnBack) {
            btnBack.onclick = () => {
                const visiblePanes = getModalVisiblePanes();
                const currentIdx = visiblePanes.indexOf(modalCurrentStep);
                if (currentIdx > 0) {
                    showModalStepPane(visiblePanes[currentIdx - 1]);
                }
            };
        }

        if (btnNext) {
            btnNext.onclick = async () => {
                if (!validateModalCurrentStep()) return;

                const visiblePanes = getModalVisiblePanes();
                const currentIdx = visiblePanes.indexOf(modalCurrentStep);

                if (currentIdx < visiblePanes.length - 1) {
                    triggerRsvpAutoSave();
                    showModalStepPane(visiblePanes[currentIdx + 1]);
                } else {
                    // Final submission - show confirmation screen instead of closing modal directly
                    btnNext.textContent = 'Saving...';
                    btnNext.disabled = true;

                    if (rsvpAutoSaveTimeout) clearTimeout(rsvpAutoSaveTimeout);
                    try {
                        await triggerRsvpAutoSave();
                        
                        // Show success confirmation screen
                        const isDecline = rsvpModalForm.querySelector('input[name="attendance_choice"]:checked')?.value === 'decline';
                        const confirmTitle = document.getElementById('rsvp-modal-confirm-title');
                        const confirmMessage = document.getElementById('rsvp-modal-confirm-message');
                        const confirmScreen = document.getElementById('rsvp-modal-confirmation');
                        
                        if (confirmScreen && confirmTitle && confirmMessage && rsvpModalForm) {
                            if (isDecline) {
                                confirmTitle.innerHTML = "We'll miss you! 😢";
                                confirmMessage.innerHTML = `
                                    We're so sorry you can't make it to our wedding celebration. Thank you for letting us know!<br><br>
                                    If your plans change, please message us directly to let us know. You can make changes up to the end of 2026.
                                `;
                            } else {
                                confirmTitle.innerHTML = "RSVP Saved! 🎉";
                                confirmMessage.innerHTML = "Thank you for updating your RSVP details. We look forward to celebrating with you!";
                            }
                            rsvpModalForm.classList.add('hidden');
                            confirmScreen.classList.remove('hidden');
                        } else {
                            closeRsvpModal();
                        }
                    } catch (e) {
                        alert("Failed to save. Please try again.");
                    } finally {
                        btnNext.textContent = 'Next';
                        btnNext.disabled = false;
                    }
                }
            };
        }
    }

    // --- DATES & ATTENDANCE MAPPING LOGIC (MODAL) ---
    function initRsvpDatesLogic(container) {
        const yesRadio = container.querySelector('input[name="attendance_choice"][value="attend"]');
        const noRadio = container.querySelector('input[name="attendance_choice"][value="decline"]');
        const dateSection = container.querySelector('#date-selection-section') || container.querySelector('#rsvp-date-selection-section');
        const arrivalSelect = container.querySelector('#arrival-date') || container.querySelector('#rsvp-arrival-date');
        const departureSelect = container.querySelector('#departure-date') || container.querySelector('#rsvp-departure-date');
        const hiddenInput = container.querySelector('#attendance-hidden-input') || container.querySelector('#rsvp-attendance-hidden-input');

        if (!yesRadio || !noRadio || !dateSection || !arrivalSelect || !departureSelect || !hiddenInput) return;

        function updateHiddenValue() {
            if (noRadio.checked) {
                hiddenInput.value = 'decline';
                if (typeof handleModalAttendanceChange === 'function') {
                    handleModalAttendanceChange('decline');
                }
                return;
            }
            if (!yesRadio.checked) {
                hiddenInput.value = '';
                return;
            }
            const arr = arrivalSelect.value;
            const dep = departureSelect.value;
            
            let option = 'full_weekend';
            if (arr === '2027-08-05' && dep === '2027-08-08') {
                option = 'full_weekend';
            } else if (arr === '2027-08-06' && dep === '2027-08-08') {
                option = 'friday_arrival';
            } else {
                option = 'ceremony_only';
            }
            
            hiddenInput.value = option;
            
            if (typeof handleModalAttendanceChange === 'function') {
                handleModalAttendanceChange(option);
            }
        }

        function syncDepartureOptions() {
            const arrVal = arrivalSelect.value;
            const depVal = departureSelect.value;
            
            departureSelect.innerHTML = '';
            if (arrVal === '2027-08-05') {
                departureSelect.innerHTML = `
                    <option value="2027-08-06">Friday 6th August 2027</option>
                    <option value="2027-08-07">Saturday 7th August 2027 (Actual Wedding Day)</option>
                    <option value="2027-08-08">Sunday 8th August 2027</option>
                `;
            } else if (arrVal === '2027-08-06') {
                departureSelect.innerHTML = `
                    <option value="2027-08-07">Saturday 7th August 2027 (Actual Wedding Day)</option>
                    <option value="2027-08-08">Sunday 8th August 2027</option>
                `;
            } else if (arrVal === '2027-08-07') {
                departureSelect.innerHTML = `
                    <option value="2027-08-08">Sunday 8th August 2027</option>
                `;
            }
            
            const optionsList = Array.from(departureSelect.options).map(o => o.value);
            if (optionsList.includes(depVal)) {
                departureSelect.value = depVal;
            } else {
                departureSelect.value = '2027-08-08';
            }
        }

        const yesCard = yesRadio.closest('.rsvp-flash-card');
        const noCard = noRadio.closest('.rsvp-flash-card');

        function toggleDateSection() {
            if (yesRadio.checked) {
                dateSection.classList.remove('hidden');
                if (yesCard) yesCard.classList.add('selected');
                if (noCard) noCard.classList.remove('selected');
            } else if (noRadio.checked) {
                dateSection.classList.add('hidden');
                if (yesCard) yesCard.classList.remove('selected');
                if (noCard) noCard.classList.add('selected');
            } else {
                dateSection.classList.add('hidden');
                if (yesCard) yesCard.classList.remove('selected');
                if (noCard) noCard.classList.remove('selected');
            }
            updateHiddenValue();
            updateModalProgressBar();
            
            // Refresh Next button text immediately so it shows "Confirm & Submit" or "Next"
            if (typeof showModalStepPane === 'function') {
                showModalStepPane(modalCurrentStep);
            }
        }

        yesRadio.addEventListener('change', () => {
            toggleDateSection();
            triggerRsvpAutoSave();
        });

        noRadio.addEventListener('change', () => {
            toggleDateSection();
            triggerRsvpAutoSave();
        });

        arrivalSelect.addEventListener('change', () => {
            syncDepartureOptions();
            updateHiddenValue();
            triggerRsvpAutoSave();
        });

        departureSelect.addEventListener('change', () => {
            updateHiddenValue();
            triggerRsvpAutoSave();
        });

        // Initialize state from saved hidden value
        const savedOption = hiddenInput.value;
        if (savedOption === 'decline') {
            noRadio.checked = true;
            yesRadio.checked = false;
            dateSection.classList.add('hidden');
            if (yesCard) yesCard.classList.remove('selected');
            if (noCard) noCard.classList.add('selected');
        } else if (savedOption) {
            yesRadio.checked = true;
            noRadio.checked = false;
            dateSection.classList.remove('hidden');
            if (yesCard) yesCard.classList.add('selected');
            if (noCard) noCard.classList.remove('selected');
            
            if (savedOption === 'friday_arrival') {
                arrivalSelect.value = '2027-08-06';
            } else if (savedOption === 'ceremony_only') {
                arrivalSelect.value = '2027-08-07';
            } else {
                arrivalSelect.value = '2027-08-05';
            }
            syncDepartureOptions();
            departureSelect.value = '2027-08-08';
        } else {
            yesRadio.checked = false;
            noRadio.checked = false;
            dateSection.classList.add('hidden');
            if (yesCard) yesCard.classList.remove('selected');
            if (noCard) noCard.classList.remove('selected');
        }
    }

    // Overwrite original renderModalRoomTeaser to support Top-teaser layout & fallback messaging
    window.renderModalRoomTeaser = function(roomName) {
        const placeholder = document.getElementById('rsvp-room-teaser-placeholder');
        if (!placeholder) return;

        const accLabel = document.getElementById('rsvp-accommodation-label');

        if (!roomName || !window.ROOM_LIBRARY || !window.ROOM_LIBRARY[roomName]) {
            if (accLabel) {
                accLabel.innerHTML = `Where will you stay? (rooms will be prioritised for full weekend guests).`;
            }
            placeholder.style.display = 'block';
            placeholder.innerHTML = `
                <div style="background: rgba(193, 162, 122, 0.05); border: 1.5px dashed rgba(193, 162, 122, 0.35); border-radius: 16px; padding: 1.25rem; margin-bottom: 1.5rem; text-align: left; font-family: 'Montserrat', sans-serif;">
                    <span style="font-size: 1.15rem; margin-right: 0.5rem;">🏰</span>
                    <strong style="font-weight: 700; color: var(--text-main); font-size: 0.95rem;">Stay On-Site</strong>
                    <p style="font-size: 0.85rem; color: var(--text-muted); margin: 0.5rem 0 0 0; line-height: 1.45;">
                        We want everyone to stay on-site! We are currently working on room allocations and will assign you a beautiful suite at Huntsham Court should you choose to stay on-site.
                    </p>
                </div>
            `;
            return;
        }

        if (accLabel) {
            accLabel.innerHTML = `If you choose to join on site you'll be in the <strong>${roomName}</strong>. Will you stay on site or find your own accommodation?`;
        }

        placeholder.style.display = 'none';
        placeholder.innerHTML = '';
    };

    // --- WHAT'S INCLUDED POPUP HANDLERS ---
    window.openWhatsIncluded = async function(event) {
        if (event) event.stopPropagation(); // Stop click bubbling to parent card
        const modal = document.getElementById('whats-included-modal');
        const textContainer = document.getElementById('whats-included-text');
        
        if (modal && textContainer) {
            modal.classList.add('open');
            const data = window.Auth ? window.Auth.user : null;
            const roomName = data?.room_assigned;
            let roomPriceStr = data?.room_price ? `£${data.room_price} per night (total room cost, not per person)` : "£TBC";

            if (roomName && window.Auth && window.Auth.client && (!data || !data.room_price)) {
                let roomData = null;
                let fetchErr = null;

                // Try 1: rooms table, name column
                let res = await window.Auth.client.from('rooms').select('*').eq('name', roomName).single();
                if (res.data) roomData = res.data;
                else {
                    fetchErr = res.error;
                    // Try 2: rooms table, room_name column
                    res = await window.Auth.client.from('rooms').select('*').eq('room_name', roomName).single();
                    if (res.data) roomData = res.data;
                    else fetchErr = res.error;
                }

                if (roomData) {
                    console.log("Fetched room data:", roomData);
                    const price = roomData.price ?? roomData.price_per_night ?? roomData.prices_per_night ?? roomData.cost ?? roomData.room_price ?? roomData.rate;
                    if (price !== null && price !== undefined) {
                        roomPriceStr = `£${price} per night (total room cost, not per person)`;
                    }
                } else {
                    console.warn("Could not find room pricing in 'rooms' table:", fetchErr);
                }
            }
            
            let roomHtml = '';
            if (roomName && window.ROOM_LIBRARY && window.ROOM_LIBRARY[roomName]) {
                const room = window.ROOM_LIBRARY[roomName];
                const imageUrl = room.photos && room.photos.length > 0 ? room.photos[0] : 'huntsham_exterior.jpg';
                roomHtml = `
                    <div style="margin-bottom: 1.5rem; text-align: center;">
                        <img src="${imageUrl}" style="width: 100%; max-height: 200px; object-fit: cover; border-radius: 12px; margin-bottom: 0.75rem;">
                        <h4 style="margin: 0; font-family: 'Playfair Display', serif; font-size: 1.3rem; color: var(--text-main);">Proposed Room: ${roomName}</h4>
                        <p style="margin: 0.25rem 0 0 0; font-weight: 600; color: var(--primary);">Room Price: ${roomPriceStr}</p>
                    </div>
                `;
            } else {
                roomHtml = `
                    <div style="margin-bottom: 1.5rem; text-align: center;">
                        <h4 style="margin: 0; font-family: 'Playfair Display', serif; font-size: 1.3rem; color: var(--text-main);">Your Room</h4>
                        <p style="margin: 0.25rem 0 0 0; font-size: 0.9rem; color: var(--text-muted);">We are currently allocating rooms and will assign yours shortly.</p>
                    </div>
                `;
            }
            
            textContainer.innerHTML = `
                ${roomHtml}
                <div style="text-align: left;">
                    <ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.75rem;">
                        <li style="display: flex; gap: 0.5rem;"><span style="color: #10b981;">✓</span> Luxury bedroom on the estate grounds</li>
                        <li style="display: flex; gap: 0.5rem;"><span style="color: #10b981;">✓</span> All meals (Breakfasts, lunches, dinners and the wedding breakfast)</li>
                        <li style="display: flex; gap: 0.5rem;"><span style="color: #10b981;">✓</span> Open bar &amp; all drinks throughout the stay</li>
                        <li style="display: flex; gap: 0.5rem;"><span style="color: #10b981;">✓</span> Daily snacks and late-night bites</li>
                        <li style="display: flex; gap: 0.5rem;"><span style="color: #10b981;">✓</span> Total access to all games, lawns, and entertainment</li>
                    </ul>
                </div>
                <p style="margin-top: 1.5rem; font-size: 0.75rem; color: var(--text-muted); font-style: italic; text-align: center;">*room subject to change</p>
            `;
        }
    };

    window.closeWhatsIncluded = function() {
        const modal = document.getElementById('whats-included-modal');
        if (modal) modal.classList.remove('open');
    };

});
