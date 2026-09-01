"use client";

import truthData from "../../data/truth.generated.json";

function lines(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function skillItems(value: string) {
  return value.split("·").map((item) => item.trim()).filter(Boolean);
}

function creditParts(value: string) {
  const [production, ...role] = value.split("—");
  return { production: production.trim(), role: role.join("—").trim() };
}

function q(field: string, value?: string) {
  return {
    "data-q-edit": "text",
    "data-q-record": "page_text",
    "data-q-product": "resume",
    "data-q-field": field,
    "data-q-value": value,
  } as const;
}

export function ResumeExperience() {
  const resume = truthData.pages.resume;

  return (
    <main className="resume-page">
      <article className="resume-document" aria-label="Quandranea Mouton résumé">
        <header className="resume-document-header">
          <div className="resume-kicker-row">
            <p {...q("intro_title")}>{resume.intro_title}</p>
            <span {...q("intro_hint")}>{resume.intro_hint}</span>
          </div>

          <div className="resume-identity">
            <div>
              <h1 {...q("name")}>{resume.name}</h1>
              <p className="resume-headline" {...q("headline")}>{resume.headline}</p>
            </div>
            <address>
              <a href={`tel:${resume.location.replace(/[^+\d]/g, "")}`} {...q("location")}>{resume.location}</a>
              <a href={`mailto:${resume.email}`} {...q("email")}>{resume.email}</a>
              <span {...q("availability")}>{resume.availability}</span>
            </address>
          </div>
        </header>

        <div className="resume-grid">
          <section className="resume-profile">
            <h2 {...q("profile_heading")}>{resume.profile_heading}</h2>
            <p {...q("profile")}>{resume.profile}</p>
          </section>

          <section className="resume-experience">
            <h2 {...q("experience_heading")}>{resume.experience_heading}</h2>
            <article>
              <div className="resume-role">
                <strong {...q("experience_1_role")}>{resume.experience_1_role}</strong>
                <span {...q("experience_1_dates")}>{resume.experience_1_dates}</span>
              </div>
              <p className="resume-place" {...q("experience_1_place")}>{resume.experience_1_place}</p>
              <ul {...q("experience_1_bullets", resume.experience_1_bullets)}>
                {lines(resume.experience_1_bullets).map((item) => <li key={item}>{item}</li>)}
              </ul>
            </article>

            <article>
              <div className="resume-role">
                <strong {...q("experience_2_role")}>{resume.experience_2_role}</strong>
                <span {...q("experience_2_dates")}>{resume.experience_2_dates}</span>
              </div>
              <p className="resume-place" {...q("experience_2_place")}>{resume.experience_2_place}</p>
              <ul {...q("experience_2_bullets", resume.experience_2_bullets)}>
                {lines(resume.experience_2_bullets).map((item) => <li key={item}>{item}</li>)}
              </ul>
            </article>
          </section>

          <section className="resume-credits">
            <h2 {...q("credits_heading")}>{resume.credits_heading}</h2>
            <ul className="resume-credit-list" {...q("credits", resume.credits)}>
              {lines(resume.credits).map((item) => {
                const credit = creditParts(item);
                return (
                  <li key={item}>
                    <span>{credit.production}</span>
                    <span>{credit.role}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="resume-skills">
            <h2 {...q("skills_heading")}>{resume.skills_heading}</h2>
            <div className="resume-skill-list" {...q("skills", resume.skills)}>
              {skillItems(resume.skills).map((item) => <span key={item}>{item}</span>)}
            </div>
          </section>

          <section className="resume-education">
            <h2 {...q("education_heading")}>{resume.education_heading}</h2>
            <div className="resume-role">
              <strong {...q("education_degree")}>{resume.education_degree}</strong>
              <span {...q("education_year")}>{resume.education_year}</span>
            </div>
            <p className="resume-place" {...q("education_school")}>{resume.education_school}</p>
          </section>

          <section className="resume-references">
            <h2 {...q("references_heading")}>{resume.references_heading}</h2>
            <p {...q("references")}>{resume.references}</p>
          </section>
        </div>
      </article>
    </main>
  );
}
