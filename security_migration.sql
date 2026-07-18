    -- ==========================================
    -- WEDDING APP SECURITY RECONCILIATION SCRIPT
    -- ==========================================

    -- 1. Enable RLS on core guest-facing tables
    ALTER TABLE guests ENABLE ROW LEVEL SECURITY;
    ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
    ALTER TABLE faqs ENABLE ROW LEVEL SECURITY;

    -- 2. Create Security Definer helper function to check roommate assignments without infinite RLS loops
    CREATE OR REPLACE FUNCTION get_room_assigned_by_access_code(ac TEXT)
    RETURNS TEXT 
    SECURITY DEFINER
    AS $$
        SELECT room_assigned FROM guests WHERE access_code = ac LIMIT 1;
    $$ LANGUAGE sql;

    -- 3. Drop all permissive "Access for all users" policies on guests
    DROP POLICY IF EXISTS "Enable read access for all users" ON guests;
    DROP POLICY IF EXISTS "Enable update access for all users" ON guests;
    DROP POLICY IF EXISTS "Enable insert access for all users" ON guests;
    DROP POLICY IF EXISTS "Enable delete access for all users" ON guests;

    -- 4. Re-create secure guests policies
    CREATE POLICY "guests_select_policy" ON guests FOR SELECT
    USING (
        (current_setting('request.headers', true)::json->>'x-access-code') IN ('HPRT0730', 'HPRTPLANNER')
        OR access_code = (current_setting('request.headers', true)::json->>'x-access-code')
        OR (
            room_assigned IS NOT NULL 
            AND room_assigned = get_room_assigned_by_access_code(current_setting('request.headers', true)::json->>'x-access-code')
        )
    );

    CREATE POLICY "guests_update_policy" ON guests FOR UPDATE
    USING (
        (current_setting('request.headers', true)::json->>'x-access-code') IN ('HPRT0730', 'HPRTPLANNER')
        OR access_code = (current_setting('request.headers', true)::json->>'x-access-code')
    )
    WITH CHECK (
        (current_setting('request.headers', true)::json->>'x-access-code') IN ('HPRT0730', 'HPRTPLANNER')
        OR access_code = (current_setting('request.headers', true)::json->>'x-access-code')
    );

    CREATE POLICY "guests_insert_policy" ON guests FOR INSERT
    WITH CHECK (
        (current_setting('request.headers', true)::json->>'x-access-code') IN ('HPRT0730', 'HPRTPLANNER')
    );

    CREATE POLICY "guests_delete_policy" ON guests FOR DELETE
    USING (
        (current_setting('request.headers', true)::json->>'x-access-code') IN ('HPRT0730', 'HPRTPLANNER')
    );


    -- 5. Re-create secure rooms policies
    DROP POLICY IF EXISTS "rooms_select_policy" ON rooms;
    DROP POLICY IF EXISTS "rooms_admin_all_policy" ON rooms;

    CREATE POLICY "rooms_select_policy" ON rooms FOR SELECT
    USING (
        (current_setting('request.headers', true)::json->>'x-access-code') IN ('HPRT0730', 'HPRTPLANNER')
        OR EXISTS (
            SELECT 1 FROM guests WHERE access_code = (current_setting('request.headers', true)::json->>'x-access-code')
        )
    );

    CREATE POLICY "rooms_admin_all_policy" ON rooms FOR ALL
    USING (
        (current_setting('request.headers', true)::json->>'x-access-code') IN ('HPRT0730', 'HPRTPLANNER')
    )
    WITH CHECK (
        (current_setting('request.headers', true)::json->>'x-access-code') IN ('HPRT0730', 'HPRTPLANNER')
    );


    -- 6. Re-create secure faqs policies
    DROP POLICY IF EXISTS "faqs_select_policy" ON faqs;
    DROP POLICY IF EXISTS "faqs_admin_all_policy" ON faqs;

    CREATE POLICY "faqs_select_policy" ON faqs FOR SELECT
    USING (
        (current_setting('request.headers', true)::json->>'x-access-code') IN ('HPRT0730', 'HPRTPLANNER')
        OR EXISTS (
            SELECT 1 FROM guests WHERE access_code = (current_setting('request.headers', true)::json->>'x-access-code')
        )
    );

    CREATE POLICY "faqs_admin_all_policy" ON faqs FOR ALL
    USING (
        (current_setting('request.headers', true)::json->>'x-access-code') IN ('HPRT0730', 'HPRTPLANNER')
    )
    WITH CHECK (
        (current_setting('request.headers', true)::json->>'x-access-code') IN ('HPRT0730', 'HPRTPLANNER')
    );


    -- 8. Secure all internal Admin Hub tables (No guest access allowed)
    ALTER TABLE hq_todos ENABLE ROW LEVEL SECURITY;
    ALTER TABLE playlists ENABLE ROW LEVEL SECURITY;
    ALTER TABLE run_of_show ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ros_streams ENABLE ROW LEVEL SECURITY;
    ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
    ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
    ALTER TABLE vendor_categories ENABLE ROW LEVEL SECURITY;
    ALTER TABLE moodboards ENABLE ROW LEVEL SECURITY;
    ALTER TABLE moodboard_elements ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "admin_todos_policy" ON hq_todos;
    CREATE POLICY "admin_todos_policy" ON hq_todos FOR ALL
    USING ((current_setting('request.headers', true)::json->>'x-access-code') IN ('HPRT0730', 'HPRTPLANNER'))
    WITH CHECK ((current_setting('request.headers', true)::json->>'x-access-code') IN ('HPRT0730', 'HPRTPLANNER'));

    DROP POLICY IF EXISTS "admin_playlists_policy" ON playlists;
    CREATE POLICY "admin_playlists_policy" ON playlists FOR ALL
    USING ((current_setting('request.headers', true)::json->>'x-access-code') IN ('HPRT0730', 'HPRTPLANNER'))
    WITH CHECK ((current_setting('request.headers', true)::json->>'x-access-code') IN ('HPRT0730', 'HPRTPLANNER'));

    DROP POLICY IF EXISTS "admin_ros_policy" ON run_of_show;
    CREATE POLICY "admin_ros_policy" ON run_of_show FOR ALL
    USING ((current_setting('request.headers', true)::json->>'x-access-code') IN ('HPRT0730', 'HPRTPLANNER'))
    WITH CHECK ((current_setting('request.headers', true)::json->>'x-access-code') IN ('HPRT0730', 'HPRTPLANNER'));

    DROP POLICY IF EXISTS "admin_ros_streams_policy" ON ros_streams;
    CREATE POLICY "admin_ros_streams_policy" ON ros_streams FOR ALL
    USING ((current_setting('request.headers', true)::json->>'x-access-code') IN ('HPRT0730', 'HPRTPLANNER'))
    WITH CHECK ((current_setting('request.headers', true)::json->>'x-access-code') IN ('HPRT0730', 'HPRTPLANNER'));

    DROP POLICY IF EXISTS "admin_settings_policy" ON settings;
    CREATE POLICY "admin_settings_policy" ON settings FOR ALL
    USING ((current_setting('request.headers', true)::json->>'x-access-code') IN ('HPRT0730', 'HPRTPLANNER'))
    WITH CHECK ((current_setting('request.headers', true)::json->>'x-access-code') IN ('HPRT0730', 'HPRTPLANNER'));

    DROP POLICY IF EXISTS "admin_vendors_policy" ON vendors;
    CREATE POLICY "admin_vendors_policy" ON vendors FOR ALL
    USING ((current_setting('request.headers', true)::json->>'x-access-code') IN ('HPRT0730', 'HPRTPLANNER'))
    WITH CHECK ((current_setting('request.headers', true)::json->>'x-access-code') IN ('HPRT0730', 'HPRTPLANNER'));

    DROP POLICY IF EXISTS "admin_vendor_categories_policy" ON vendor_categories;
    CREATE POLICY "admin_vendor_categories_policy" ON vendor_categories FOR ALL
    USING ((current_setting('request.headers', true)::json->>'x-access-code') IN ('HPRT0730', 'HPRTPLANNER'))
    WITH CHECK ((current_setting('request.headers', true)::json->>'x-access-code') IN ('HPRT0730', 'HPRTPLANNER'));

    DROP POLICY IF EXISTS "admin_moodboards_policy" ON moodboards;
    CREATE POLICY "admin_moodboards_policy" ON moodboards FOR ALL
    USING ((current_setting('request.headers', true)::json->>'x-access-code') IN ('HPRT0730', 'HPRTPLANNER'))
    WITH CHECK ((current_setting('request.headers', true)::json->>'x-access-code') IN ('HPRT0730', 'HPRTPLANNER'));

    DROP POLICY IF EXISTS "admin_moodboard_elements_policy" ON moodboard_elements;
    CREATE POLICY "admin_moodboard_elements_policy" ON moodboard_elements FOR ALL
    USING ((current_setting('request.headers', true)::json->>'x-access-code') IN ('HPRT0730', 'HPRTPLANNER'))
    WITH CHECK ((current_setting('request.headers', true)::json->>'x-access-code') IN ('HPRT0730', 'HPRTPLANNER'));


    -- 9. Re-create secure storage policies for guest photos
    DROP POLICY IF EXISTS "guest_photos_read_policy" ON storage.objects;
    DROP POLICY IF EXISTS "guest_photos_write_policy" ON storage.objects;
    DROP POLICY IF EXISTS "guest_photos_delete_policy" ON storage.objects;

    CREATE POLICY "guest_photos_read_policy" ON storage.objects FOR SELECT
    USING (
        bucket_id = 'guest-photos'
        AND (
            (current_setting('request.headers', true)::json->>'x-access-code') IN ('HPRT0730', 'HPRTPLANNER')
            OR EXISTS (
                SELECT 1 FROM guests WHERE access_code = (current_setting('request.headers', true)::json->>'x-access-code')
            )
        )
    );

    CREATE POLICY "guest_photos_write_policy" ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'guest-photos'
        AND (
            (current_setting('request.headers', true)::json->>'x-access-code') IN ('HPRT0730', 'HPRTPLANNER')
            OR EXISTS (
                SELECT 1 FROM guests WHERE access_code = (current_setting('request.headers', true)::json->>'x-access-code')
            )
        )
    );

    CREATE POLICY "guest_photos_delete_policy" ON storage.objects FOR DELETE
    USING (
        bucket_id = 'guest-photos'
        AND (
            (current_setting('request.headers', true)::json->>'x-access-code') IN ('HPRT0730', 'HPRTPLANNER')
            OR EXISTS (
                SELECT 1 FROM guests WHERE access_code = (current_setting('request.headers', true)::json->>'x-access-code')
            )
        )
    );
