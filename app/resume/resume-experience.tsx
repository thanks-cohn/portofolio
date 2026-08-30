"use client";

import { useEffect, useRef } from "react";

export function ResumeExperience() {
  const resumeRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      resumeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main className="resume-page">
      <section className="resume-intro" aria-label="Resume introduction">
        <h1>RESUME</h1>
        <span>Scroll back up anytime</span>
      </section>

      <section className="resume-document" ref={resumeRef} aria-label="Mock resume">
        <header className="resume-document-header">
          <div>
            <p>QUANDRANEA M. MAYBE</p>
            <h2>Scene Designer & Keeper of Improbable Rooms</h2>
          </div>
          <address>
            Somewhere just offstage<br />
            hello@example.com<br />
            Available after intermission
          </address>
        </header>

        <div className="resume-grid">
          <section>
            <h3>Profile</h3>
            <p>
              Scene designer with a fondness for theatrical architecture, impossible entrances,
              practical illusions, and making a perfectly normal chair feel suspicious.
            </p>
          </section>

          <section>
            <h3>Experience</h3>
            <article>
              <div className="resume-role"><strong>Lead Scene Designer</strong><span>2024–Present</span></div>
              <p className="resume-place">The Department of Dramatic Entrances</p>
              <ul>
                <li>Designed rooms that looked expensive while remaining legally just plywood.</li>
                <li>Coordinated scenic builds, paint treatments, prop logic, and audience sightlines.</li>
                <li>Reduced emergency fog-machine diplomacy by a statistically meaningful amount.</li>
              </ul>
            </article>
            <article>
              <div className="resume-role"><strong>Assistant Scenic Designer</strong><span>2022–2024</span></div>
              <p className="resume-place">The Very Serious Players</p>
              <ul>
                <li>Prepared drafting packages, research boards, models, and production notes.</li>
                <li>Tracked scenic changes through rehearsals without losing the one important stool.</li>
                <li>Maintained calm when someone said “what if the wall simply flew away?”</li>
              </ul>
            </article>
          </section>

          <section>
            <h3>Selected Credits</h3>
            <ul className="resume-credit-list">
              <li><strong>The Chair That Knew Too Much</strong> — Scenic Design</li>
              <li><strong>Three Doors, No Exit, One Snack Table</strong> — Scenic Design</li>
              <li><strong>A Respectable Amount of Fog</strong> — Associate Designer</li>
              <li><strong>Hamlet, But the Couch Is Important</strong> — Assistant Designer</li>
            </ul>
          </section>

          <section>
            <h3>Education</h3>
            <div className="resume-role"><strong>B.F.A., Theatre Design</strong><span>2022</span></div>
            <p className="resume-place">University of Extremely Specific Curtains</p>
          </section>

          <section>
            <h3>Skills</h3>
            <p>
              Scenic design · drafting · model making · visual research · paint elevations ·
              production collaboration · Vectorworks-adjacent confidence · emergency glitter containment
            </p>
          </section>

          <section>
            <h3>References</h3>
            <p>Available upon request, assuming the stage manager has forgiven me.</p>
          </section>
        </div>
      </section>
    </main>
  );
}
