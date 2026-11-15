export default function BriefGuide() {
  return (
    <section className="brief-guide" aria-labelledby="brief-guide-title">
      <h2 id="brief-guide-title">Your first brief, step by step</h2>
      <p>
        A brief is a short description of what you want to improve at your selected site. Everyday
        language is enough. You can add detail and change it later.
      </p>
      <ol>
        <li>
          <strong>Choose who the project is for.</strong> Choose Developer decision for an
          improvement your own organisation is considering, or Contractor proposal for work you are
          proposing to a client.
        </li>
        <li>
          <strong>Give it a name and a contact.</strong> Use a name you will recognise. The internal
          sponsor is the person or team asking for the improvement; the client is the person or
          organisation you are preparing a proposal for.
        </li>
        <li>
          <strong>Describe the problem, people and goal.</strong> What happens now? Who uses the
          space, and when? What would make it better? A sentence for each is enough.
        </li>
        <li>
          <strong>Add what you know.</strong> Open the extra sections if you have a budget, things
          to protect, or a list of work to include. Write “To confirm” for uncertain details, or
          leave optional fields blank.
        </li>
      </ol>
      <p>
        Start with the project name and sponsor or client, check the timezone and currency, then
        choose <strong>Create project</strong>. You can return through <strong>Edit brief</strong>.
      </p>
      <details>
        <summary>See an example: a more comfortable courtyard</summary>
        <p>
          Fictional example for reference. Adapt the wording to your site; these details are not
          added to your form.
        </p>
        <dl className="brief-guide-example">
          <dt>What are you working towards?</dt>
          <dd>Developer decision — our own organisation is considering an improvement.</dd>
          <dt>Project name / Internal sponsor</dt>
          <dd>Courtyard lunch area / Facilities team</dd>
          <dt>What problem should this project address?</dt>
          <dd>
            Staff say the courtyard feels too hot at lunchtime, so they rarely sit outside. We have
            not yet checked which areas get shade throughout the day.
          </dd>
          <dt>Who will use the space?</dt>
          <dd>Staff and visitors eating lunch or taking a break, including wheelchair users.</dd>
          <dt>What outcome are you looking for?</dt>
          <dd>
            A more comfortable place to sit, with shade and a clear, step-free route to the
            entrance.
          </dd>
          <dt>Relevant use times</dt>
          <dd>Weekdays, 12:00–14:00 local time. These are the times we want to study later.</dd>
          <dt>Project timezone / Currency</dt>
          <dd>Asia/Kuala_Lumpur / MYR for this Malaysian example. Use your site's settings.</dd>
          <dt>Budget, priorities and stakeholders</dt>
          <dd>
            Project type: courtyard improvement. Budget ceiling: 30,000 MYR as an initial planning
            limit, to confirm with the sponsor. Leave the minimum blank if none is set. Priorities:
            shade, easy access and simple upkeep. Constraints (limits to work around): keep the
            existing trees and entrance open. Stakeholders (people affected): staff, visitors and
            the facilities team.
          </dd>
          <dt>Site notes, known facts and unknowns</dt>
          <dd>
            Known: existing benches were seen during a site visit; record the visit date and who
            observed them. Unknown: underground services and exact dimensions need checking. Keep
            guesses separate from confirmed information and say where each fact came from.
          </dd>
          <dt>Agreed scope, assumptions and sources</dt>
          <dd>
            Deliverables (what you will prepare): two layout ideas and an initial cost estimate.
            Inclusions (work to consider): seating, planting and shade options. Exclusions (work
            left out): car park changes. Intended use: help the facilities team choose an option.
            Unresolved questions: final budget and service locations. Add sourced facts as Known,
            Estimated or Unknown as appropriate. Save the draft now; confirm the scope with the
            sponsor later.
          </dd>
        </dl>
        <p>
          Preparing a client proposal instead? Choose <strong>Contractor proposal</strong>, enter
          your client's name, and describe what they need in the same way.
        </p>
      </details>
      <details>
        <summary>What does “Client and opportunity” mean?</summary>
        <p>
          These optional fields help you organise the enquiry: owner is the person following it up,
          due date is when a response is needed, stage is how far the enquiry has progressed, source
          is how it came to you, and tags are your own keywords. You can leave them for later. A
          brief template is saved wording you can reuse.
        </p>
      </details>
    </section>
  )
}
