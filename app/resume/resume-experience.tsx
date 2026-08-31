"use client";

import { useEffect, useRef } from "react";
import truthData from "../../data/truth.generated.json";

function lines(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
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
  const resumeRef = useRef<HTMLElement | null>(null);
  const resume = truthData.pages.resume;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      resumeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main className="resume-page">
      <section className="resume-intro" aria-label="Resume introduction">
        <h1 {...q("intro_title")}>{resume.intro_title}</h1>
        <span {...q("intro_hint")}>{resume.intro_hint}</span>
      </section>

      <section className="resume-document" ref={resumeRef} aria-label="Resume">
        <header className="resume-document-header">
          <div>
            <p {...q("name")}>{resume.name}</p>
            <h2 {...q("headline")}>{resume.headline}</h2>
          </div>
          <address>
            <span {...q("location")}>{resume.location}</span><br />
            <span {...q("email")}>{resume.email}</span><br />
            <span {...q("availability")}>{resume.availability}</span>
          </address>
        </header>

        <div className="resume-grid">
          <section>
            <h3 {...q("profile_heading")}>{resume.profile_heading}</h3>
            <p {...q("profile")}>{resume.profile}</p>
          </section>

          <section>
            <h3 {...q("experience_heading")}>{resume.experience_heading}</h3>
            <article>
              <div className="resume-role"><strong {...q("experience_1_role")}>{resume.experience_1_role}</strong><span {...q("experience_1_dates")}>{resume.experience_1_dates}</span></div>
              <p className="resume-place" {...q("experience_1_place")}>{resume.experience_1_place}</p>
              <ul {...q("experience_1_bullets", resume.experience_1_bullets)}>
                {lines(resume.experience_1_bullets).map((item) => <li key={item}>{item}</li>)}
              </ul>
            </article>
            <article>
              <div className="resume-role"><strong {...q("experience_2_role")}>{resume.experience_2_role}</strong><span {...q("experience_2_dates")}>{resume.experience_2_dates}</span></div>
              <p className="resume-place" {...q("experience_2_place")}>{resume.experience_2_place}</p>
              <ul {...q("experience_2_bullets", resume.experience_2_bullets)}>
                {lines(resume.experience_2_bullets).map((item) => <li key={item}>{item}</li>)}
              </ul>
            </article>
          </section>

          <section>
            <h3 {...q("credits_heading")}>{resume.credits_heading}</h3>
            <ul className="resume-credit-list" {...q("credits", resume.credits)}>
              {lines(resume.credits).map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>

          <section>
            <h3 {...q("education_heading")}>{resume.education_heading}</h3>
            <div className="resume-role"><strong {...q("education_degree")}>{resume.education_degree}</strong><span {...q("education_year")}>{resume.education_year}</span></div>
            <p className="resume-place" {...q("education_school")}>{resume.education_school}</p>
          </section>

          <section>
            <h3 {...q("skills_heading")}>{resume.skills_heading}</h3>
            <p {...q("skills")}>{resume.skills}</p>
          </section>

          <section>
            <h3 {...q("references_heading")}>{resume.references_heading}</h3>
            <p {...q("references")}>{resume.references}</p>
          </section>
        </div>
      </section>
    </main>
  );
}
