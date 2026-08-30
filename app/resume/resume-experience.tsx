"use client";

import { useEffect, useRef } from "react";
import truthData from "../../data/truth.generated.json";

function lines(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
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
        <h1>{resume.intro_title}</h1>
        <span>{resume.intro_hint}</span>
      </section>

      <section className="resume-document" ref={resumeRef} aria-label="Resume">
        <header className="resume-document-header">
          <div>
            <p>{resume.name}</p>
            <h2>{resume.headline}</h2>
          </div>
          <address>
            {resume.location}<br />
            {resume.email}<br />
            {resume.availability}
          </address>
        </header>

        <div className="resume-grid">
          <section>
            <h3>{resume.profile_heading}</h3>
            <p>{resume.profile}</p>
          </section>

          <section>
            <h3>{resume.experience_heading}</h3>
            <article>
              <div className="resume-role"><strong>{resume.experience_1_role}</strong><span>{resume.experience_1_dates}</span></div>
              <p className="resume-place">{resume.experience_1_place}</p>
              <ul>
                {lines(resume.experience_1_bullets).map((item) => <li key={item}>{item}</li>)}
              </ul>
            </article>
            <article>
              <div className="resume-role"><strong>{resume.experience_2_role}</strong><span>{resume.experience_2_dates}</span></div>
              <p className="resume-place">{resume.experience_2_place}</p>
              <ul>
                {lines(resume.experience_2_bullets).map((item) => <li key={item}>{item}</li>)}
              </ul>
            </article>
          </section>

          <section>
            <h3>{resume.credits_heading}</h3>
            <ul className="resume-credit-list">
              {lines(resume.credits).map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>

          <section>
            <h3>{resume.education_heading}</h3>
            <div className="resume-role"><strong>{resume.education_degree}</strong><span>{resume.education_year}</span></div>
            <p className="resume-place">{resume.education_school}</p>
          </section>

          <section>
            <h3>{resume.skills_heading}</h3>
            <p>{resume.skills}</p>
          </section>

          <section>
            <h3>{resume.references_heading}</h3>
            <p>{resume.references}</p>
          </section>
        </div>
      </section>
    </main>
  );
}
