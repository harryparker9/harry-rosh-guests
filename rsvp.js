document.addEventListener('DOMContentLoaded', () => {
    // 1. Auth Guard / Init
    if (!window.Auth || !window.Auth.client) {
        console.error("Auth helper not loaded");
        return;
    }
    const supabase = window.Auth.client;

    const rsvpForm = document.getElementById('rsvp-form');
    const rsvpGate = document.getElementById('rsvp-gate');
    const gateCodeInput = document.getElementById('gate-code');
    const btnUnlock = document.getElementById('btn-unlock');
    const gateError = document.getElementById('gate-error');

    const confirmationDiv = document.getElementById('rsvp-confirmation');
    const confirmationMessage = document.getElementById('confirmation-message');

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
            if (data.song_request) document.getElementById('songRequest').value = data.song_request;
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

            // 3. Conditional Logic
            // A. VIP Accommodation
            const accommodationGroup = document.getElementById('accommodation-group');
            if (data.is_onsite_allowed) {
                accommodationGroup.classList.remove('hidden');
            } else {
                accommodationGroup.classList.add('hidden');
            }

            // B. Plus One
            const plusOneSection = document.getElementById('plus-one-section');
            if (data.has_plus_one) {
                plusOneSection.classList.remove('hidden');
                // Auto-fill if data exists
                if (data.plus_one_full_name) document.getElementById('plusOneName').value = data.plus_one_full_name;
                if (data.plus_one_dietary) document.getElementById('plusOneDietary').value = data.plus_one_dietary;
            } else {
                plusOneSection.classList.add('hidden');
            }

            // If we hid it, we should maybe clear required attributes if any?
            // The accommodation radio buttons are technically not 'required' in the original HTML 
            // (user didn't set 'required' attribute on them in rsvp.html Step 364 check).
            // Checking Step 364: <input type="radio" name="accommodation" value="onsite"> -- no required attr.
            // So simply hiding is fine.

        } catch (err) {
            console.error('Unlock Error:', err);
            gateError.textContent = 'System Error. Please try again.';
            gateError.classList.remove('hidden');
            btnUnlock.textContent = 'Unlock RSVP';
            btnUnlock.disabled = false;
        }
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

    // Handle form submission
    rsvpForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const submitBtn = rsvpForm.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn.textContent;
        submitBtn.textContent = 'Uploading...';
        submitBtn.disabled = true;

        // Gather form data
        const formData = new FormData(rsvpForm);

        let photoUrl = null;
        const fileInput = document.getElementById('photoUpload');
        const file = fileInput.files[0];

        try {
            // 1. Handle Photo Upload
            if (file) {
                const fileExt = file.name.split('.').pop();
                const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
                const filePath = `${fileName}`;

                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('guest-photos')
                    .upload(filePath, file);

                if (uploadError) {
                    throw uploadError;
                }

                const { data: publicUrlData } = supabase.storage
                    .from('guest-photos')
                    .getPublicUrl(filePath);

                photoUrl = publicUrlData.publicUrl;
            }

            // 2. Prepare Database Payload
            const data = {
                access_code: formData.get('accessCode'), // Hidden field value
                full_name: formData.get('fullName'),
                phone: formData.get('phone'),
                attendance_option: formData.get('attendance'),
                accommodation_preference: formData.get('accommodation'),
                dietary_requirements: formData.get('dietary'),
                song_request: formData.get('songRequest'),
                funny_story: formData.get('funnyStory'),
                marriage_advice: formData.get('advice'),
                speech_prediction: formData.get('speechBet'),
                photo_url: photoUrl,
                // Plus One Fields
                plus_one_full_name: formData.get('plusOneName'),
                plus_one_dietary: formData.get('plusOneDietary')
            };

            console.log('Inserting Data:', data);

            // 3. Update Guests Table
            // Strict check for access code
            const codeToUpdate = document.getElementById('gate-code').value || formData.get('accessCode');
            if (!codeToUpdate) {
                throw new Error("No Access Code found. Please refresh and try again.");
            }

            console.log('Updating user with code:', codeToUpdate);

            const { data: updatedData, error: updateError } = await supabase
                .from('guests')
                .update(data)
                .eq('access_code', codeToUpdate)
                .select(); // Add select to see if row was returned

            if (updateError) {
                console.error('Supabase Update Error:', updateError);
                alert('Save failed: ' + updateError.message);
                // Reset button state
                submitBtn.textContent = originalBtnText;
                submitBtn.disabled = false;
                return; // Stop execution
            }

            if (!updatedData || updatedData.length === 0) {
                console.error('Update returned no data. Check access code.');
                alert('Save failed: Could not find guest with code ' + codeToUpdate);
                submitBtn.textContent = originalBtnText;
                submitBtn.disabled = false;
                return;
            }

            // 4. Auto-Login & Redirect
            // Save session to localStorage (mimicking auth.js)
            const userSession = {
                access_code: codeToUpdate,
                full_name: data.full_name,
                room_assigned: null,
                attendance_option: formData.get('attendance'), // Update local RSVP status immediately
                is_onsite_allowed: updatedData[0].is_onsite_allowed || false
            };
            localStorage.setItem('user', JSON.stringify(userSession));

            // Show temporary success message
            rsvpForm.classList.add('hidden');
            confirmationMessage.innerHTML = 'RSVP Saved! <br> Redirecting to your dashboard...';
            confirmationDiv.classList.remove('hidden');

            // Redirect after 2 seconds
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 2000);

        } catch (err) {
            console.error('Error during RSVP:', err);
            alert('Something went wrong: ' + (err.message || err));
            submitBtn.textContent = originalBtnText;
            submitBtn.disabled = false;
        }
    });
});
