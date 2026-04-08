-- Fix incorrect building names and coordinates from initial seed (0004).

-- CTL: was "Clinical Teaching Facility" — should be Catalyst (NTPLLN, north campus).
update public.campus_buildings
set display_name = 'Catalyst',
    lat          = 32.8804,
    lng          = -117.24165,
    aliases      = array['CATALYST']
where code = 'CTL';

-- SERF: was "Student Services Center" — should be Science and Engineering Research Facility.
update public.campus_buildings
set display_name = 'Science and Engineering Research Facility',
    lat          = 32.879678,
    lng          = -117.234780
where code = 'SERF';

-- RWAC: was "Rady School of Management" — should be Ridge Walk Academic Complex.
-- Located adjacent to Catalyst in the north campus area.
update public.campus_buildings
set display_name = 'Ridge Walk Academic Complex',
    lat          = 32.8804,
    lng          = -117.24165,
    aliases      = array['RIDGE WALK']
where code = 'RWAC';
