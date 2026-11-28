# Landing Copy Guidelines

Read this guide before changing `apps/landing`, including layout, navigation, project cards, and search metadata. Layout and link changes can alter what existing copy appears to promise.

This guide owns public-facing copy for the Cedarflake Lab portfolio. Individual projects retain their own product terminology and documentation. Repository-wide catalog, lifecycle, and URL rules remain in [Repository Rules](../../../docs/repository-rules.md).

## Positioning and audience

Cedarflake Lab presents a personal collection of software projects, tools, interface studies, and experiments.

The primary reader is a visitor discovering the work. A project may serve a developer, a player, a desktop user, or the owner of a private deployment. Do not silently assign that project role to every visitor.

Before writing, establish:

1. **Object:** What is being presented: an application, component, starter, script, game, or visual study?
2. **Scenario:** What task or experiment is it intended for, and who performs it?
3. **Destination:** What will the actual link open: source, a demonstration, a download, documentation, or an administration page?

Name roles and setup requirements when they change the visitor's expectations. A template starter should read as a development resource; an owner console should read as an administration surface.

## What each surface should say

| Surface                     | Responsibility                                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Hero                        | Establish the personal portfolio and the kinds of work it contains.                                              |
| Section heading             | Explain what qualifies a project for that collection.                                                            |
| Project summary             | Identify the project and its concrete use case.                                                                  |
| Project label               | Identify the format or intended context in a few words.                                                          |
| Technology tags             | Provide implementation context for interested technical readers.                                                 |
| Action                      | Describe the actual destination or supported action.                                                             |
| Note or status              | Explain a relevant constraint, such as an unofficial recreation, work in development, or restricted destination. |
| Repository section          | Introduce the source repository and its organization.                                                            |
| Search and sharing metadata | Use the same positioning and claims as the visible page.                                                         |

Keep section explanations distinct from project descriptions. Do not add a second paragraph that repeats the introduction or tells visitors to click an already obvious link.

## Voice and claims

- Describe the work in clear, concrete language. State what it is and what it does before listing implementation details.
- Keep visual slogans short. An expressive heading can accompany a precise label or description; it must not carry the whole explanation alone.
- Avoid treating visitors as signed-in owners or developers by default. Imperative wording is appropriate for real actions such as opening a source repository or playing an available demo.
- Use "Try", "Play", "Install", or "Download" only when the linked destination supports that action. A source link should not read like an instant-use button.
- Distinguish an interactive demonstration from a reusable component, a development starter from an end-user application, and a public page from its owner's console.
- Derive claims from the project's current README and implementation. For external projects, inspect the owning repository or verified project documentation when changing factual claims.
- Describe the current state. Do not present planned features as implemented or a prototype as a finished release. Use the existing lifecycle and status vocabulary.
- Name collections according to their actual selection rules. A set selected by `showcase` is "Selected projects", even when that set is sorted by update date.
- Prefer familiar terms such as project, component, source, and repository. Explain a technical term when it is necessary to understand the use case.
- Keep names consistent across navigation, headings, summaries, tooltips, accessible names, and metadata. Existing fragment IDs can stay stable when a visible label changes.
- Preserve the site's current language unless translation is requested. Keep conversational persona and implementation-process commentary out of public copy.

## Examples from this portfolio

These examples illustrate the distinction; verify current project facts before reusing them.

| Wording to reconsider                                            | Problem                                                                         | Better framing                                                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| "Create and manage redirect links" for Nami                      | Assigns an operator's role to a browsing visitor.                               | A self-hosted redirect project exploring routing rules, edge runtimes, and traffic analytics.       |
| "Share your current status" for Shika                            | Blurs the owner console and the public visitor's view.                          | A personal status-page project with a private owner console and a public view of published updates. |
| "Preview, personalize, and send email" with a "Local tool" label | Suggests an email application where the project is a template starter.          | A React Email starter with HTML rendering and SMTP sending scripts for custom email templates.      |
| "Latest projects" for a curated showcase collection              | Claims a complete recent-project view that the selection rule does not provide. | Selected projects.                                                                                  |
| "Open bench" for the repository section                          | Resembles the separate Workbench collection without explaining the destination. | Repository / Inside the Lab repository.                                                             |

## Sources and editing workflow

| Source                    | Owns                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| `src/config/site.ts`      | Hero, navigation, section headings, repository overview, and footer copy.                  |
| `src/config/projects/`    | Project identity, summaries, format labels, showcase notes, and action destinations.       |
| `src/config/seo.ts`       | Search and sharing descriptions.                                                           |
| Project README and source | Evidence for the project's purpose, supported behavior, prerequisites, and current status. |
| This guide                | Portfolio positioning, voice, and review criteria.                                         |

For each change:

1. Identify the reader, project role, use case, and real destination. Check the owning project when any of these are uncertain.
2. Update the owning copy configuration and any other surface that repeats the changed claim. Apply URL and lifecycle synchronization from Repository Rules when those facts change.
3. Read the result alongside its heading, adjacent cards, action controls, and status. Check that each element adds useful information.
4. Inspect desktop and narrow mobile layouts for awkward wrapping, repeated explanations, and actions whose meaning depends only on a hover tooltip.
5. Run the landing app's required checks and build. Browser verification must cover changed labels and destinations; automated checks alone cannot assess audience or meaning.

Use these questions for the final review: Can a visitor tell what this is, who uses it, where it runs, and what happens after clicking? Does the page describe an actual capability without implying access the visitor does not have?
