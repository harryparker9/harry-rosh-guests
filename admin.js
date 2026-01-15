document.addEventListener('DOMContentLoaded', async () => {
    // 1. Auth Check
    if (!window.Auth || !window.Auth.requireAdmin()) return;

    const supabase = window.Auth.client;
    const allGuests = []; // Will be populated

    // 2. Helper Variables
    const tableBody = document.getElementById('guest-table-body');
    const searchInput = document.getElementById('admin-search');

    // Populate Room Dropdown
    const roomSelect = document.getElementById('edit-room');
    if (window.ROOM_LIBRARY && roomSelect) {
        const sortedRooms = Object.keys(window.ROOM_LIBRARY).sort();
        sortedRooms.forEach(roomName => {
            const opt = document.createElement('option');
            opt.value = roomName;
            opt.textContent = roomName;
            roomSelect.appendChild(opt);
        });
    }

    // 3. Fetch Data
    async function fetchGuests() {
        const { data, error } = await supabase
            .from('guests')
            .select('*')
            .order('full_name', { ascending: true });

        if (error) {
            console.error('Error fetching guests:', error);
            alert('Failed to load guest data.');
            return;
        }

        // Clear array and push new data
        allGuests.length = 0;
        allGuests.push(...data);

        renderStats();
        renderTable(allGuests);
    }

    // 4. Render Stats
    function renderStats() {
        const total = allGuests.length;
        const confirmed = allGuests.filter(g => g.attendance_option && g.attendance_option !== 'decline').length;
        const pending = allGuests.filter(g => !g.attendance_option).length;
        const onsite = allGuests.filter(g => g.is_onsite_allowed).length;

        document.getElementById('stat-total').textContent = total;
        document.getElementById('stat-confirmed').textContent = confirmed;
        document.getElementById('stat-onsite').textContent = onsite;
        document.getElementById('stat-pending').textContent = pending;
    }

    // 5. Render Table
    function renderTable(guests) {
        tableBody.innerHTML = '';

        guests.forEach(guest => {
            const row = document.createElement('tr');

            // Format Status
            let statusBadge = `<span class="tag" style="background:#f3f4f6; color:#374151; padding:2px 8px; border-radius:12px; font-size:0.8rem;">Pending</span>`;
            if (guest.attendance_option === 'decline') statusBadge = `<span class="tag" style="background:#fee2e2; color:#991b1b; padding:2px 8px; border-radius:12px; font-size:0.8rem;">Declined</span>`;
            if (guest.attendance_option === 'friday_arrival') statusBadge = `<span class="tag" style="background:#dcfce7; color:#166534; padding:2px 8px; border-radius:12px; font-size:0.8rem;">Fri Arrival</span>`;
            if (guest.attendance_option === 'thursday_arrival') statusBadge = `<span class="tag" style="background:#dcfce7; color:#166534; padding:2px 8px; border-radius:12px; font-size:0.8rem;">Thu Arrival</span>`;

            // Onsite Tag
            const onsiteTag = guest.is_onsite_allowed
                ? `<span class="tag onsite-yes">Yes</span>`
                : `<span class="tag onsite-no">No</span>`;

            // Room Column with Status Dot
            let roomDisplay = '<span style="color:#ccc; font-style:italic;">Unassigned</span>';
            if (guest.room_assigned) {
                let statusColor = '#ccc'; // Default/Pending
                let statusTitle = "Unknown Status";

                if (guest.room_status === 'offered') {
                    statusColor = '#facc15'; // Yellow
                    statusTitle = "Offered (Payment Pending)";
                } else if (guest.room_status === 'confirmed') {
                    statusColor = '#22c55e'; // Green
                    statusTitle = "Confirmed";
                }

                roomDisplay = `
                    <div style="display:flex; align-items:center;">
                        <span style="height:10px; width:10px; border-radius:50%; background-color:${statusColor}; margin-right:8px;" title="${statusTitle}"></span>
                        ${guest.room_assigned}
                    </div>
                `;
            }

            row.innerHTML = `
                <td style="font-weight:600;">${guest.full_name || 'Unknown'}</td>
                <td>${statusBadge}</td>
                <td>${guest.attendance_option === 'friday_arrival' ? 'Friday' : (guest.attendance_option === 'thursday_arrival' ? 'Thursday' : '-')}</td>
                <td style="font-size:0.9rem; color:#666;">${guest.dietary_requirements || '-'}</td>
                <td>${roomDisplay}</td>
                <td>${onsiteTag}</td>
                <td>
                    <button class="btn-icon btn-edit" data-code="${guest.access_code}">✎</button>
                </td>
            `;
            tableBody.appendChild(row);
        });

        // Re-attach listeners
        document.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const code = e.target.getAttribute('data-code');
                openEditModal(code);
            });
        });
    }

    // 6. Search Filter
    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = allGuests.filter(g =>
            (g.full_name && g.full_name.toLowerCase().includes(term)) ||
            (g.room_assigned && g.room_assigned.toLowerCase().includes(term)) ||
            (g.dietary_requirements && g.dietary_requirements.toLowerCase().includes(term))
        );
        renderTable(filtered);
    });

    // 7. Edit Modal Logic
    const editModal = document.getElementById('edit-modal');
    const closeEdit = document.querySelector('.close-edit');
    const editForm = document.getElementById('edit-form');

    function openEditModal(code) {
        const guest = allGuests.find(g => g.access_code === code);
        if (!guest) return;

        document.getElementById('edit-access-code').value = guest.access_code;
        document.getElementById('edit-fullname').value = guest.full_name;
        document.getElementById('edit-room').value = guest.room_assigned || '';
        document.getElementById('edit-room-status').value = guest.room_status || 'offered';
        document.getElementById('edit-onsite').value = guest.is_onsite_allowed ? "true" : "false";

        editModal.classList.add('open');
    }

    if (closeEdit) closeEdit.addEventListener('click', () => editModal.classList.remove('open'));
    window.addEventListener('click', (e) => { if (e.target === editModal) editModal.classList.remove('open'); });

    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = document.getElementById('edit-access-code').value;
        const newRoom = document.getElementById('edit-room').value;
        const newStatus = document.getElementById('edit-room-status').value;
        const isOnsite = document.getElementById('edit-onsite').value === "true";

        const { error } = await supabase
            .from('guests')
            .update({
                room_assigned: newRoom,
                room_status: newStatus,
                is_onsite_allowed: isOnsite
            })
            .eq('access_code', code);

        if (error) {
            alert('Error updating guest: ' + error.message);
        } else {
            editModal.classList.remove('open');
            fetchGuests(); // Refresh table
        }
    });

    // 8. Live Alert Logic
    const alertBtn = document.getElementById('btn-push-alert');
    const alertInput = document.getElementById('alert-message');

    alertBtn.addEventListener('click', async () => {
        const msg = alertInput.value.trim();
        if (!msg) {
            alert("Please enter a message!");
            return;
        }

        const originalText = alertBtn.textContent;
        alertBtn.textContent = "Pushing...";
        alertBtn.disabled = true;

        const { error } = await supabase
            .from('site_settings')
            .upsert({ id: 1, alert_message: msg });

        if (error) {
            console.error('Alert Error:', error);
            alert("Failed to push alert: " + error.message);
        } else {
            alert("Alert Pushed to All Dashboards!");
            alertInput.value = '';
        }

        alertBtn.textContent = originalText;
        alertBtn.disabled = false;
    });

    // Initial Load
    fetchGuests();
});
