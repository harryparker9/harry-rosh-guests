document.addEventListener('DOMContentLoaded', () => {
    // 1. Auth Guard / Init
    if (!window.Auth || !window.Auth.client) {
        console.error("Auth helper not loaded");
        return;
    }
    let supabase = window.Auth.client;

    function cleanHeaders(client) {
        if (!client) return;
        if (client.auth && client.auth.headers) {
            delete client.auth.headers['x-access-code'];
        }
        if (client.storage && client.storage.headers) {
            delete client.storage.headers['x-access-code'];
        }
        if (client.functions && client.functions.headers) {
            delete client.functions.headers['x-access-code'];
        }
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

    const rsvpForm = document.getElementById('rsvp-form');
    const rsvpGate = document.getElementById('rsvp-gate');
    const gateCodeInput = document.getElementById('gate-code');
    const btnUnlock = document.getElementById('btn-unlock');
    const gateError = document.getElementById('gate-error');

    const confirmationDiv = document.getElementById('rsvp-confirmation');
    const confirmationMessage = document.getElementById('confirmation-message');

    let autoSaveTimeout = null;

    // Cache user guest data locally
    window.guestData = null;

    function handleAttendanceChange(value) {
        const accommodationGroup = document.getElementById('accommodation-group');
        const accommodationLabel = document.getElementById('accommodation-label');
        const step3 = document.getElementById('step3-section');
        const step4 = document.getElementById('step4-section');
        
        if (value === 'decline') {
            if (accommodationGroup) accommodationGroup.classList.add('hidden');
            if (step3) step3.classList.add('hidden');
            if (step4) step4.classList.add('hidden');
        } else {
            const isOnsiteAllowed = window.guestData?.is_onsite_allowed;
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

    // --- Unlock Function ---
    async function unlockRSVP(code) {
        if (!code) return;

        gateError.classList.add('hidden');
        btnUnlock.textContent = 'Verifying...';
        btnUnlock.disabled = true;

        try {
            // Re-initialize client with correct access code header first so the select query is permitted
            window.Auth.client = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
                global: {
                    headers: {
                        'x-access-code': code
                    }
                }
            });
            cleanHeaders(window.Auth.client);
            supabase = window.Auth.client;

            // Query Supabase
            const { data, error } = await supabase
                .from('guests')
                .select('*')
                .eq('access_code', code)
                .single();

            if (error || !data) {
                // Invalid Code
                gateError.textContent = 'Invalid Access Code';
                gateError.classList.remove('hidden');
                btnUnlock.textContent = 'Unlock RSVP';
                btnUnlock.disabled = false;
                return;
            }

            // Valid Code
            window.guestData = data;

            // 1. Reveal Form
            rsvpGate.classList.add('hidden');
            rsvpForm.classList.remove('hidden');

            // 2. Auto-Fill Data
            document.getElementById('accessCode').value = code; // Hidden field

            if (data.full_name) {
                document.getElementById('fullName').value = data.full_name;
            }
            if (data.phone) document.getElementById('phone').value = data.phone;
            if (data.dietary_requirements) document.getElementById('dietary').value = data.dietary_requirements;
            if (data.funny_story) document.getElementById('funnyStory').value = data.funny_story;
            if (data.marriage_advice) document.getElementById('advice').value = data.marriage_advice;
            if (data.speech_prediction) document.getElementById('speechBet').value = data.speech_prediction;
            if (data.song_request) document.getElementById('song_request').value = data.song_request;

            // Load Drink Preferences
            document.querySelectorAll('input[name="drink_pref"]').forEach(cb => cb.checked = false);
            document.getElementById('special_drink_requests').value = '';
            
            const drinksSection = document.getElementById('drinks-section');
            if (shouldHideDrinks(data.full_name)) {
                if (drinksSection) drinksSection.classList.add('hidden');
            } else {
                if (drinksSection) drinksSection.classList.remove('hidden');
            }

            if (data.drink_preferences) {
                try {
                    const parsed = JSON.parse(data.drink_preferences);
                    if (parsed && Array.isArray(parsed.drinks)) {
                        parsed.drinks.forEach(val => {
                            const cb = document.querySelector(`input[name="drink_pref"][value="${val}"]`);
                            if (cb) cb.checked = true;
                        });
                    }
                    if (parsed && parsed.special) {
                        document.getElementById('special_drink_requests').value = parsed.special;
                    }
                } catch (e) {
                    document.getElementById('special_drink_requests').value = data.drink_preferences;
                }
            }

            // Set saved value to hidden input
            const hiddenInput = document.getElementById('attendance-hidden-input');
            if (hiddenInput) {
                hiddenInput.value = data.attendance_option || 'full_weekend';
            }

            // Radio Buttons: Accommodation
            if (data.accommodation_preference) {
                const radio = document.querySelector(`input[name="accommodation"][value="${data.accommodation_preference}"]`);
                if (radio) radio.checked = true;
            }



            // 3. Conditional Visibility setup
            handleAttendanceChange(data.attendance_option);

            // 5. Render Photo Gallery
            const urls = getPhotoUrls(data.photo_url);
            renderPhotoGallery(urls, 'uploaded-photos-container', (idx) => deletePhoto(idx, true));

            // 6. Sync selections and render room teaser
            syncVisualSelections();
            renderRoomTeaser(data.room_assigned);
            initRsvpDatesLogic(document.getElementById('rsvp-form'));

            // 7. Initialize Wizard Views
            setupFlashCards();
            setupWizard();
            showStepPane(1);

        } catch (err) {
            console.error('Unlock Error:', err);
            gateError.textContent = 'System Error. Please try again.';
            gateError.classList.remove('hidden');
            btnUnlock.textContent = 'Unlock RSVP';
            btnUnlock.disabled = false;
        }
    }

    // --- Photo Gallery Helpers ---
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

    async function deletePhoto(index, isModal) {
        const codeToUpdate = document.getElementById('gate-code').value || document.getElementById('accessCode').value;
        if (!codeToUpdate) return;

        const indicator = document.getElementById('rsvp-status-indicator');
        const statusText = indicator ? indicator.querySelector('.status-text') : null;
        const statusDot = indicator ? indicator.querySelector('.status-dot') : null;
        if (statusText) statusText.textContent = 'Saving...';
        if (statusDot) statusDot.style.background = '#eab308';

        try {
            const { data: latestGuest, error: fetchErr } = await supabase
                .from('guests')
                .select('photo_url')
                .eq('access_code', codeToUpdate)
                .single();

            if (fetchErr) throw fetchErr;

            let currentUrls = getPhotoUrls(latestGuest.photo_url);
            currentUrls.splice(index, 1);

            const serialized = currentUrls.length > 0 ? JSON.stringify(currentUrls) : null;

            const { error: dbError } = await supabase
                .from('guests')
                .update({ photo_url: serialized })
                .eq('access_code', codeToUpdate);

            if (dbError) throw dbError;

            // Sync local data states
            if (window.guestData) window.guestData.photo_url = serialized;
            const sessionUser = JSON.parse(localStorage.getItem('user'));
            if (sessionUser) {
                sessionUser.photo_url = serialized;
                localStorage.setItem('user', JSON.stringify(sessionUser));
            }

            renderPhotoGallery(currentUrls, 'uploaded-photos-container', (idx) => deletePhoto(idx, false));

            if (statusText) statusText.textContent = 'All changes saved';
            if (statusDot) statusDot.style.background = '#10b981';
        } catch (err) {
            console.error('Delete photo error:', err);
            if (statusText) statusText.textContent = 'Failed to delete photo';
            if (statusDot) statusDot.style.background = '#ef4444';
        }
    }

    // --- Auto-Save Function ---
    async function triggerAutoSave() {
        const indicator = document.getElementById('rsvp-status-indicator');
        if (!indicator) return;
        const statusText = indicator.querySelector('.status-text');
        const statusDot = indicator.querySelector('.status-dot');
        statusText.textContent = 'Saving...';
        statusDot.style.background = '#eab308'; // Amber

        const formData = new FormData(rsvpForm);
        const codeToUpdate = document.getElementById('gate-code').value || formData.get('accessCode');
        if (!codeToUpdate) return;

        const drinksHidden = shouldHideDrinks(formData.get('fullName'));
        const selectedDrinks = drinksHidden ? [] : Array.from(document.querySelectorAll('input[name="drink_pref"]:checked')).map(el => el.value);
        const specialRequests = drinksHidden ? "" : document.getElementById('special_drink_requests').value;

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
                .eq('access_code', codeToUpdate)
                .select();

            if (updateError) throw updateError;

            // Sync user to localStorage
            if (updatedData && updatedData[0]) {
                const userSession = {
                    access_code: codeToUpdate,
                    full_name: payload.full_name,
                    room_assigned: updatedData[0].room_assigned || null,
                    room_status: updatedData[0].room_status || null,
                    attendance_option: payload.attendance_option,
                    is_onsite_allowed: updatedData[0].is_onsite_allowed || false,
                    photo_url: updatedData[0].photo_url || null
                };
                localStorage.setItem('user', JSON.stringify(userSession));
                window.guestData = updatedData[0];
            }

            statusText.textContent = 'All changes saved';
            statusDot.style.background = '#10b981'; // Green
        } catch (err) {
            console.error('Auto-save error:', err);
            statusText.textContent = 'Save failed';
            statusDot.style.background = '#ef4444'; // Red
        }
    }

    function queueAutoSave() {
        if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
        autoSaveTimeout = setTimeout(triggerAutoSave, 1000);
    }

    // --- Magic Link Logic ---
    const urlParams = new URLSearchParams(window.location.search);
    const magicCode = urlParams.get('code');

    if (magicCode) {
        gateCodeInput.value = magicCode;
        unlockRSVP(magicCode);
    }

    // --- Button Event ---
    if (btnUnlock) {
        btnUnlock.addEventListener('click', () => {
            const code = gateCodeInput.value.trim();
            if (code) unlockRSVP(code);
        });
    }

    if (!rsvpForm) return;

    // Auto-save listeners on form fields
    rsvpForm.addEventListener('input', (e) => {
        if ((e.target.tagName === 'INPUT' && (e.target.type === 'text' || e.target.type === 'tel')) || e.target.tagName === 'TEXTAREA') {
            queueAutoSave();
        }
    });

    rsvpForm.addEventListener('change', (e) => {
        if (e.target.tagName === 'INPUT' && e.target.type === 'radio') {
            if (e.target.name === 'attendance') {
                handleAttendanceChange(e.target.value);
            }
            triggerAutoSave();
        }
        if (e.target.tagName === 'INPUT' && e.target.type === 'checkbox') {
            triggerAutoSave();
        }
        if ((e.target.tagName === 'INPUT' && (e.target.type === 'text' || e.target.type === 'tel')) || e.target.tagName === 'TEXTAREA') {
            if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
            triggerAutoSave();
        }
    });

    // File Input Auto-Upload (Multiple Files)
    const photoInput = document.getElementById('photoUpload');
    if (photoInput) {
        photoInput.addEventListener('change', async () => {
            const files = Array.from(photoInput.files);
            if (files.length === 0) return;

            // Check 5 photos limit
            const currentUrls = getPhotoUrls(window.guestData?.photo_url);
            if (currentUrls.length + files.length > 5) {
                alert(`You can upload a maximum of 5 photos. You currently have ${currentUrls.length} photo(s) uploaded and selected ${files.length} more.`);
                photoInput.value = '';
                
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

            const codeToUpdate = document.getElementById('gate-code').value || document.getElementById('accessCode').value;

            try {
                const { data: latestGuest, error: fetchErr } = await supabase
                    .from('guests')
                    .select('photo_url')
                    .eq('access_code', codeToUpdate)
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

                const { error: dbError } = await supabase
                    .from('guests')
                    .update({ photo_url: serialized })
                    .eq('access_code', codeToUpdate);

                if (dbError) throw dbError;

                // Sync data states
                if (window.guestData) window.guestData.photo_url = serialized;
                const sessionUser = JSON.parse(localStorage.getItem('user'));
                if (sessionUser) {
                    sessionUser.photo_url = serialized;
                    localStorage.setItem('user', JSON.stringify(sessionUser));
                }

                // Render gallery
                renderPhotoGallery(updatedUrls, 'uploaded-photos-container', (idx) => deletePhoto(idx, false));

                // Clear files input so same files can be re-selected
                photoInput.value = '';

                if (statusText) statusText.textContent = 'Uploaded successfully!';
                if (statusDot) statusDot.style.background = '#10b981';
            } catch (err) {
                console.error('Photo upload error:', err);
                if (statusText) statusText.textContent = 'Upload failed';
                if (statusDot) statusDot.style.background = '#ef4444';
            }
        });
    }

    // Form submit is handled by the wizard next button, but we prevent default just in case
    rsvpForm.addEventListener('submit', (e) => {
        e.preventDefault();
    });

    // --- WIZARD HELPER FUNCTIONS ---
    let currentStep = 1;

    function getVisiblePanes() {
        const visiblePanes = [1, 2];
        const choice = document.querySelector('input[name="attendance_choice"]:checked');
        const hiddenInput = document.getElementById('attendance-hidden-input');
        const isOnsite = window.guestData?.is_onsite_allowed;

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

    function showStepPane(stepIndex) {
        const visiblePanes = getVisiblePanes();
        
        // Hide all panes
        document.querySelectorAll('.rsvp-step-pane').forEach(pane => {
            pane.classList.remove('active');
        });

        // Show target pane
        const targetPane = document.getElementById(`pane-${stepIndex}`);
        if (targetPane) {
            targetPane.classList.add('active');
        }

        currentStep = stepIndex;

        // Update nav buttons
        const btnBack = document.getElementById('btn-wizard-back');
        const btnNext = document.getElementById('btn-wizard-next');

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

        updateProgressBar();
    }

    function validateCurrentStep() {
        // Step 1 validation (required name/phone)
        if (currentStep === 1) {
            const fullName = document.getElementById('fullName');
            const phone = document.getElementById('phone');
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
        // Step 2 validation (attendance required)
        if (currentStep === 2) {
            const choice = document.querySelector('input[name="attendance_choice"]:checked');
            if (!choice) {
                alert("Please select whether you will be attending.");
                return false;
            }
        }
        // Step 3 validation (accommodation required if visible)
        if (currentStep === 3) {
            const accommodationSelected = document.querySelector('input[name="accommodation"]:checked');
            if (!accommodationSelected) {
                alert("Please select your accommodation preference.");
                return false;
            }
        }
        return true;
    }

    function updateProgressBar() {
        const dots = Array.from(document.querySelectorAll('.rsvp-progress-step'));
        const visiblePanes = getVisiblePanes();
        const totalSteps = visiblePanes.length;

        let stepNumber = 1;
        dots.forEach(dot => {
            const paneId = parseInt(dot.getAttribute('data-step'));
            const isPaneVisible = visiblePanes.includes(paneId);

            if (isPaneVisible) {
                dot.style.display = 'flex';
                const dotCircle = dot.querySelector('.rsvp-progress-dot');
                if (dotCircle) dotCircle.textContent = stepNumber;

                const currentPaneIndex = visiblePanes.indexOf(currentStep);
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
        const currentPaneIndex = visiblePanes.indexOf(currentStep);
        const progressLine = document.getElementById('wizard-progress-line');
        if (progressLine) {
            const percentage = totalSteps > 1 ? (currentPaneIndex / (totalSteps - 1)) * 100 : 0;
            progressLine.style.width = `${percentage}%`;
        }
    }

    function syncVisualSelections() {
        // Attendance Choice yes/no cards
        const hiddenInput = document.getElementById('attendance-hidden-input');
        if (hiddenInput) {
            const val = hiddenInput.value;
            const yesCard = document.getElementById('card-attendance-yes');
            const noCard = document.getElementById('card-attendance-decline');
            const yesRadio = document.querySelector('input[name="attendance_choice"][value="attend"]');
            const noRadio = document.querySelector('input[name="attendance_choice"][value="decline"]');
            const dateSection = document.getElementById('date-selection-section');
            
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
        document.querySelectorAll('input[name="accommodation"]').forEach(r => {
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
        document.querySelectorAll('input[name="drink_pref"]').forEach(cb => {
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

    function setupFlashCards() {
        // Accommodation change listener to update cards
        document.querySelectorAll('input[name="accommodation"]').forEach(radio => {
            radio.addEventListener('change', () => {
                document.querySelectorAll('input[name="accommodation"]').forEach(r => {
                    const card = r.closest('.rsvp-flash-card');
                    if (card) {
                        if (r.checked) card.classList.add('selected');
                        else card.classList.remove('selected');
                    }
                });
                triggerAutoSave();
            });
        });

        // Drink checkbox pills
        const drinkChips = document.querySelectorAll('.drink-chip input[name="drink_pref"]');
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
                triggerAutoSave();
            });
        });

        // Make progress dots clickable
        const dots = Array.from(document.querySelectorAll('.rsvp-progress-step'));
        dots.forEach(dot => {
            dot.style.cursor = 'pointer';
            dot.addEventListener('click', () => {
                const targetStep = parseInt(dot.getAttribute('data-step'));
                const visiblePanes = getVisiblePanes();
                if (visiblePanes.includes(targetStep)) {
                    // Allow clicking back freely. If clicking forward, validate current step.
                    if (targetStep < currentStep || validateCurrentStep()) {
                        showStepPane(targetStep);
                    }
                }
            });
        });
    }

    function renderRoomTeaser(roomName) {
        const placeholder = document.getElementById('room-teaser-placeholder');
        if (!placeholder) return;

        placeholder.innerHTML = '';
        placeholder.style.display = 'none';
        return;
    }

    function setupWizard() {
        const btnBack = document.getElementById('btn-wizard-back');
        const btnNext = document.getElementById('btn-wizard-next');

        if (btnBack) {
            btnBack.onclick = () => {
                const visiblePanes = getVisiblePanes();
                const currentIdx = visiblePanes.indexOf(currentStep);
                if (currentIdx > 0) {
                    showStepPane(visiblePanes[currentIdx - 1]);
                }
            };
        }

        if (btnNext) {
            btnNext.onclick = async () => {
                if (!validateCurrentStep()) return;

                const visiblePanes = getVisiblePanes();
                const currentIdx = visiblePanes.indexOf(currentStep);

                if (currentIdx < visiblePanes.length - 1) {
                    triggerAutoSave();
                    showStepPane(visiblePanes[currentIdx + 1]);
                } else {
                    // Final submission
                    btnNext.textContent = 'Saving...';
                    btnNext.disabled = true;

                    if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
                    try {
                        await triggerAutoSave();
                        
                        // Show temporary success message
                        const isDecline = document.querySelector('input[name="attendance_choice"]:checked')?.value === 'decline';
                        const confirmTitle = document.getElementById('confirmation-title');
                        
                        rsvpForm.classList.add('hidden');
                        if (isDecline) {
                            if (confirmTitle) confirmTitle.innerHTML = "We'll miss you! 😢";
                            confirmationMessage.innerHTML = `
                                We're so sorry you can't make it to our wedding celebration. Thank you for letting us know!<br><br>
                                <span style="font-size: 0.95rem; color: var(--text-main);">If your plans change, please message us directly to let us know. You can make changes up to the end of 2026.</span><br><br>
                                <button class="btn-modal-submit" onclick="window.location.href='dashboard.html'" style="max-width: 250px; padding: 0.8rem 2rem; margin-top: 1rem; border-radius: 50px; font-family: 'Montserrat', sans-serif;">Return to Dashboard</button>
                            `;
                        } else {
                            if (confirmTitle) confirmTitle.innerHTML = "RSVP Saved! 🎉";
                            confirmationMessage.innerHTML = 'Thank you for updating your RSVP details. <br> Redirecting to your dashboard...';
                            setTimeout(() => {
                                window.location.href = 'dashboard.html';
                            }, 1500);
                        }
                        confirmationDiv.classList.remove('hidden');
                    } catch (e) {
                        alert("Failed to save. Please try again.");
                        btnNext.textContent = 'Finish & Dashboard';
                        btnNext.disabled = false;
                    }
                }
            };
        }
    }

    // --- DATES & ATTENDANCE MAPPING LOGIC ---
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
                if (typeof handleAttendanceChange === 'function') {
                    handleAttendanceChange('decline');
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
            
            if (typeof handleAttendanceChange === 'function') {
                handleAttendanceChange(option);
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
            updateProgressBar();
            
            // Refresh Next button text immediately so it shows "Confirm & Submit" or "Next"
            if (typeof showStepPane === 'function') {
                showStepPane(currentStep);
            }
        }

        yesRadio.addEventListener('change', () => {
            toggleDateSection();
            triggerAutoSave();
        });

        noRadio.addEventListener('change', () => {
            toggleDateSection();
            triggerAutoSave();
        });

        arrivalSelect.addEventListener('change', () => {
            syncDepartureOptions();
            updateHiddenValue();
            triggerAutoSave();
        });

        departureSelect.addEventListener('change', () => {
            updateHiddenValue();
            triggerAutoSave();
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

    // Overwrite the original renderRoomTeaser to support Top-teaser layout & fallback messaging
    window.renderRoomTeaser = function(roomName) {
        const placeholder = document.getElementById('room-teaser-placeholder');
        if (!placeholder) return;

        const accLabel = document.getElementById('accommodation-label');

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
            const data = window.guestData;
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
