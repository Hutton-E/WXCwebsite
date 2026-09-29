-- Cross country rosters are from the fall, while graduation occurs the
-- following spring. Existing graduation years were calculated from the
-- fall season and need to be moved forward by one calendar year.
update public.athletes
set graduation_year = graduation_year + 1
where graduation_year is not null;
