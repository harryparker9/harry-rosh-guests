document.addEventListener('DOMContentLoaded', () => {
    // 1. Auth Guard / Init
    if (!window.Auth || !window.Auth.client) {
        console.error("Auth helper not loaded");
        return;
    }
    let supabase = window.Auth.client;

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

    // --- Dynamic Form Branching Logic ---
    function handleAttendanceChange(value) {
        const accommodationGroup = document.getElementById('accommodation-group');
        const accommodationLabel = document.getElementById('accommodation-label');
        const plusOneSection = document.getElementById('plus-one-section');
        const step3 = document.getElementById('step3-section');
        const step4 = document.getElementById('step4-section');
        
        if (value === 'decline') {
            if (accommodationGroup) accommodationGroup.classList.add('hidden');
            if (plusOneSection) plusOneSection.classList.add('hidden');
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
            if (plusOneSection) {
                if (window.guestData?.has_plus_one) {
                    plusOneSection.classList.remove('hidden');
                } else {
                    plusOneSection.classList.add('hidden');
                }
            }
            if (step3) step3.classList.remove('hidden');
            if (step4) step4.classList.remove('hidden');

            if (accommodationLabel) {
                const tourLink = `<a href="https://www.youtube.com/watch?v=whc_XCoT8mc&t=15s" target="_blank" class="venue-link">(Watch Venue Tour)</a>`;
                if (value === 'friday_arrival') {
                    accommodationLabel.innerHTML = `Attendance on-site is prioritised for guests attending the whole time, however would you want to be considered for space on-site if there is space? ${tourLink}`;
                } else {
                    accommodationLabel.innerHTML = `Accommodation Preference ${tourLink}`;
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
            // Query Supabase
            const { data, error } = await supabase
                .from('guests')
                .select('*')
                .eq('access_code', code)
                .headers({ 'x-access-code': code })
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

            // Re-initialize client with correct access code header for auto-saves and uploads
            window.Auth.client = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
                global: {
                    headers: {
                        'x-access-code': code
                    }
                }
            });
            supabase = window.Auth.client;

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

            // Radio Buttons: Attendance
            if (data.attendance_option) {
                const radio = document.querySelector(`input[name="attendance"][value="${data.attendance_option}"]`);
                if (radio) radio.checked = true;
            }

            // Radio Buttons: Accommodation
            if (data.accommodation_preference) {
                const radio = document.querySelector(`input[name="accommodation"][value="${data.accommodation_preference}"]`);
                if (radio) radio.checked = true;
            }

            // 4. Plus One Setup
            const plusOneSection = document.getElementById('plus-one-section');
            if (data.has_plus_one) {
                plusOneSection.classList.remove('hidden');
                if (data.plus_one_full_name) document.getElementById('plusOneName').value = data.plus_one_full_name || '';
                if (data.plus_one_dietary) document.getElementById('plusOneDietary').value = data.plus_one_dietary || '';
            } else {
                plusOneSection.classList.add('hidden');
            }

            // 3. Conditional Visibility setup
            handleAttendanceChange(data.attendance_option);

            // 5. Render Photo Gallery
            const urls = getPhotoUrls(data.photo_url);
            renderPhotoGallery(urls, 'uploaded-photos-container', (idx) => deletePhoto(idx, false));

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

        const payload = {
            full_name: formData.get('fullName'),
            phone: formData.get('phone'),
            attendance_option: formData.get('attendance'),
            accommodation_preference: formData.get('accommodation') || null,
            dietary_requirements: formData.get('dietary'),
            funny_story: formData.get('funnyStory'),
            marriage_advice: formData.get('advice'),
            speech_prediction: formData.get('speechBet'),
            plus_one_full_name: formData.get('plusOneName') || null,
            plus_one_dietary: formData.get('plusOneDietary') || null
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

    // Handle form submission (Final redirect)
    rsvpForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const submitBtn = rsvpForm.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn.textContent;
        submitBtn.textContent = 'Redirecting...';
        submitBtn.disabled = true;

        if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
        await triggerAutoSave();

        const formData = new FormData(rsvpForm);
        const attendance = formData.get('attendance');

        if (!attendance) {
            alert("Please choose an attendance option before finishing.");
            submitBtn.textContent = originalBtnText;
            submitBtn.disabled = false;
            return;
        }

        // Show temporary success message
        rsvpForm.classList.add('hidden');
        confirmationMessage.innerHTML = 'RSVP Saved! <br> Redirecting to your dashboard...';
        confirmationDiv.classList.remove('hidden');

        // Redirect after 1.5 seconds
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 1500);
    });
});
