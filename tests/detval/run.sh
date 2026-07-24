#!/bin/bash
# UNI-145 validation: deTECHtor --skip-crawl ON vs OFF on the same institutions.
DET="$(cd "$(dirname "$0")/../.." && pwd)"
NODE="$(command -v node)"
OUT="$(dirname "$0")"
mkdir -p "$OUT"

# id|home|admissions|program
INSTS=(
"1|https://www.huntington.edu|https://www.huntington.edu/admissions/undergraduate|https://www.huntington.edu/online/programs/psychology"
"2|https://www.wrexham.ac.uk/|https://wrexham.ac.uk/study/apply/|https://wrexham.ac.uk/subject-area/science-degrees/"
"3|https://www.kent.edu/trumbull|https://www.kent.edu/trumbull/first-year-students|https://onlinedegrees.kent.edu/degrees/bachelor-of-technical-and-applied-studies"
"4|https://www.northwestms.edu/|https://www.northwestms.edu/admissions|https://www.northwestms.edu/programs/programsandpathways"
"5|https://www.fvtc.edu/|https://www.fvtc.edu/admissions|https://www.fvtc.edu/program/business-management-finance/business-management/20-145-7/entrepreneurship-and-small-business-management"
"6|https://www.wnmu.edu|https://admissions.wnmu.edu/|https://sb.wnmu.edu/associate-of-science-in-business-administration/bbamarketing/"
"7|https://www.nmhu.edu|https://www.nmhu.edu/undergraduate-admissions/|https://online.nmhu.edu/online-bachelors-degrees/"
"8|https://www.stbernards.edu/|https://www.stbernards.edu/admissions|https://www.stbernards.edu/certificate-programs"
"9|https://www.wou.edu|https://wou.edu/admission/apply/|https://wou.edu/criminal-justice/undergraduate-degrees/bas-criminal-justice/"
"10|https://www.canterbury.ac.nz/|https://www.canterbury.ac.nz/study/getting-started/admission-and-enrolment/enrolment-topics|https://www.canterbury.ac.nz/study/academic-study/education"
"12|https://www.pupr.edu/|https://pupr.edu/admissions/prospective-students/|https://pupr.edu/master-civil-engineering/"
"13|https://global.nmsu.edu|https://global.nmsu.edu/admissions/|https://global.nmsu.edu/degree-programs/bachelors/business-administration-general-business/"
"14|https://law.hofstra.edu/|https://law.hofstra.edu/admissions/|https://law.hofstra.edu/academics/juris-doctor-degree"
"15|https://www.masters.edu/|https://www.masters.edu/admissions-aid/undergraduate-admissions/|https://online.masters.edu/programs/bachelor-of-arts-liberal-studies/"
"17|https://www.eac.edu|https://eac.edu/admissions/|https://eac.edu/academics/programs/nursing/"
"19|https://www.scitexas.edu/|https://scitexas.edu/admissions/|https://scitexas.edu/aascsm/"
"20|https://www.carrollcc.edu|https://www.carrollcc.edu/admissions-aid/|https://www.carrollcc.edu/programs/degrees-credit-certificates/nursing-registered-nurse-a-s/"
"22|https://www.sterling.edu|https://www.sterling.edu/admissions|https://online.sterling.edu/professional-studies-post-secondary-education-licensure-program/"
"23|https://www.iwp.edu/|https://www.iwp.edu/admissions/|https://www.iwp.edu/academics/graduate-certificates/"
"28|https://www.tuskegee.edu|https://www.tuskegee.edu/admissions/|https://www.tuskegee.edu/academics/colleges-schools/tsacs/bachelor-of-arts-in-design.html"
"29|https://www.ut.edu/|https://www.ut.edu/admissions|https://www.ut.edu/academics/college-of-arts-and-letters/department-of-film-animation-and-new-media/film-and-media-arts-ba-and-bfa-degree-programs"
)

echo "START $(date)"
for row in "${INSTS[@]}"; do
  IFS='|' read -r id home adm prog <<< "$row"
  timeout 100 "$NODE" "$DET/cli.js" --url "$home" --output "$OUT/$id-off.json" >/dev/null 2>&1
  offrc=$?
  timeout 100 "$NODE" "$DET/cli.js" --url "$home" --extra-url "$adm" --extra-url "$prog" --skip-crawl --output "$OUT/$id-on.json" >/dev/null 2>&1
  onrc=$?
  echo "done id=$id off_rc=$offrc on_rc=$onrc"
done
echo "ALL_DONE $(date)"
