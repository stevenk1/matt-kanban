// The sidebar's "Stories in a step": the Stories whose loop is mid-step right now (the
// reader gave them a step), newest first. Stories between steps or stopped don't show. Stories
// are optional: BoardView leaves this list out when no Project on the Board keeps any.
import type { Project, Story } from '../board/board';

type StoryInStep = { story: Story; project: Project; step: string };

export function StoryList({ projects }: { projects: Project[] }) {
  const inStep = storiesInStep(projects);
  return (
    <>
      <div className="side-label" id="stories-in-a-step">
        Stories in a step
      </div>
      <ul className="side-list" aria-labelledby="stories-in-a-step">
        {inStep.map(({ story, project, step }) => (
          <li key={`${project.dir}/${story.slug}`} className="side-story" title={tooltip(story)}>
            <div className="side-story-goal">{story.goal}</div>
            <div className="side-story-meta">
              {project.name} · {step}
            </div>
          </li>
        ))}
      </ul>
      {inStep.length === 0 && <p className="side-none">No Stories in a step</p>}
    </>
  );
}

function storiesInStep(projects: Project[]): StoryInStep[] {
  return projects
    .flatMap((project) =>
      project.stories.flatMap((story) => (story.step === null ? [] : [{ story, project, step: story.step }])),
    )
    .sort((a, b) => b.story.updated - a.story.updated);
}

function tooltip(story: Story): string {
  return [story.goal, story.waiting && `Waiting: ${story.waiting}`, story.lastLog && `Last: ${story.lastLog}`]
    .filter(Boolean)
    .join('\n');
}
