-- Canonical UCSD building code → display name + coordinates table.
-- Acts as the single source of truth that can be edited in the Supabase dashboard
-- without requiring a code deployment.

create table if not exists public.campus_buildings (
  code         text primary key,
  display_name text not null,
  lat          float8,
  lng          float8,
  aliases      text[] not null default '{}',
  updated_at   timestamptz not null default now()
);

-- Public read; service role can write.
alter table public.campus_buildings enable row level security;
create policy "public read campus_buildings"
  on public.campus_buildings for select using (true);

-- Seed data — all known UCSD buildings.
-- To correct a wrong coordinate, update the row directly in the Supabase dashboard.
insert into public.campus_buildings (code, display_name, lat, lng, aliases) values
  ('CENTR',   'Center Hall',                        32.87977, -117.23620, array['CENTER','CTR']),
  ('WLH',     'Warren Lecture Hall',                32.88104, -117.23381, array['WL']),
  ('PCYNH',   'Pepper Canyon Hall',                 32.87705, -117.23588, array['PEPPER']),
  ('MANDE',   'Mandeville Center',                  32.87898, -117.24098, array['MAND']),
  ('HSS',     'Humanities & Social Sciences',       32.87787, -117.23736, array[]::text[]),
  ('LEDDN',   'Leichtag Family Foundation Hall',    32.87467, -117.23684, array[]::text[]),
  ('YORK',    'York Hall',                          32.87540, -117.23561, array[]::text[]),
  ('SOLIS',   'Solis Hall',                         32.88173, -117.23394, array[]::text[]),
  ('PETER',   'Peterson Hall',                      32.87749, -117.23528, array[]::text[]),
  ('GALB',    'Galbraith Hall',                     32.87711, -117.23478, array['GH']),
  ('EBU1',    'Engineering Building Unit 1',        32.87985, -117.23373, array[]::text[]),
  ('EBU2',    'Engineering Building Unit 2',        32.87952, -117.23310, array[]::text[]),
  ('EBU3B',   'Engineering Building Unit 3B',       32.88145, -117.23315, array['EBU3','EBEN','EBUB']),
  ('ERCA',    'Engineering Research Complex A',     32.88220, -117.23320, array[]::text[]),
  ('ATK',     'Atkinson Hall',                      32.88229, -117.23346, array[]::text[]),
  ('APM',     'Applied Physics & Mathematics',      32.87938, -117.24053, array[]::text[]),
  ('CTL',     'Clinical Teaching Facility',         32.87408, -117.23522, array[]::text[]),
  ('MAYER',   'Mayer Hall',                         32.87524, -117.23732, array[]::text[]),
  ('UREY',    'Urey Hall',                          32.87514, -117.23784, array[]::text[]),
  ('BONNER',  'Bonner Hall',                        32.87438, -117.23861, array[]::text[]),
  ('SKAGGS',  'Skaggs School of Pharmacy',          32.87459, -117.23830, array['SKAGG']),
  ('CSB',     'Cognitive Science Building',         32.87850, -117.23437, array['COGNITIVE']),
  ('CSE',     'Computer Science & Engineering',     32.88145, -117.23315, array[]::text[]),
  ('BIOMED',  'Biomedical Sciences Building',       32.87385, -117.23745, array[]::text[]),
  ('CMM',     'Center for Molecular Medicine',      32.87315, -117.23680, array[]::text[]),
  ('RBC',     'Robinson Building Complex',          32.87622, -117.23860, array[]::text[]),
  ('SSB',     'Social Sciences Building',           32.87764, -117.23820, array[]::text[]),
  ('SSC',     'Social Sciences Research Building',  32.87790, -117.23795, array[]::text[]),
  ('RWAC',    'Rady School of Management',          32.88268, -117.23451, array[]::text[]),
  ('THEA',    'Theater District',                   32.87963, -117.24175, array[]::text[]),
  ('GEISEL',  'Geisel Library',                     32.88099, -117.23744, array['LIB','LIBS']),
  ('PRICE',   'Price Center',                       32.87976, -117.23748, array[]::text[]),
  ('MUIR',    'Muir College',                       32.87842, -117.24162, array[]::text[]),
  ('REVELLE', 'Revelle College',                    32.87395, -117.24206, array[]::text[]),
  ('WARREN',  'Warren College',                     32.88210, -117.23401, array[]::text[]),
  ('MARSH',   'Marshall College',                   32.88012, -117.23522, array[]::text[]),
  ('SIXTH',   'Sixth College',                      32.88350, -117.23590, array[]::text[]),
  ('SEVENTH', 'Seventh College',                    32.88440, -117.23300, array[]::text[]),
  ('EIGHTH',  'Eighth College',                     32.88390, -117.23230, array[]::text[]),
  ('RIMAC',   'RIMAC Arena',                        32.88460, -117.24065, array[]::text[]),
  ('SERF',    'Student Services Center',            32.87960, -117.23665, array[]::text[])
on conflict (code) do nothing;
