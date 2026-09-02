export default function MatchCard({ label, teamA, teamB, pointsA, pointsB, winnerId, seed, onTeamClick, provisional }) {
  const hasResult = pointsA != null || pointsB != null;
  const aWon = winnerId && teamA && winnerId === teamA.id;
  const bWon = winnerId && teamB && winnerId === teamB.id;
  // Provisional rounds have no winner yet — just emphasize the current leader.
  const bothScored = pointsA != null && pointsB != null;
  const aLead = provisional && bothScored && pointsA > pointsB;
  const bLead = provisional && bothScored && pointsB > pointsA;
  const aHi = aWon || aLead;
  const bHi = bWon || bLead;

  const fmt = (n) => (n == null ? '' : Number.isInteger(n) ? n : Math.round(n * 10) / 10);

  function teamName(team) {
    if (!team) return 'TBD';
    return team.users?.display_name ?? team.name ?? 'TBD';
  }

  const clickProps = (team) =>
    onTeamClick && team
      ? {
          role: 'button',
          tabIndex: 0,
          onClick: () => onTeamClick(team),
          onKeyDown: (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onTeamClick(team);
            }
          },
        }
      : {};

  const interactive = (team) =>
    onTeamClick && team ? ' cursor-pointer hover:bg-surface-hover rounded-md -mx-1 px-1' : '';

  return (
    <div className="bg-surface border border-border rounded-xl p-3 min-w-[180px]">
      {label && (
        <span className="text-label-caps text-muted block mb-2">
          {label}
          {provisional && <span className="ml-1.5 text-tertiary normal-case">· en vivo</span>}
        </span>
      )}

      {/* Team A */}
      <div
        {...clickProps(teamA)}
        className={`flex items-center justify-between py-1 gap-2 ${
          aHi ? 'text-primary' : hasResult ? 'text-muted' : 'text-secondary'
        }${interactive(teamA)}`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {seed?.a != null && (
            <span className="text-label-caps text-muted flex-shrink-0">({seed.a})</span>
          )}
          {aWon && <span className="text-label-caps text-tertiary flex-shrink-0">W</span>}
          <span className={`text-xs truncate ${aLead ? 'font-semibold' : ''}`}>{teamName(teamA)}</span>
        </div>
        {pointsA != null && (
          <span className={`text-sm font-bold flex-shrink-0 ${aHi ? 'text-tertiary' : ''}`}>
            {fmt(pointsA)}
          </span>
        )}
      </div>

      <div className="border-t border-border my-0.5" />

      {/* Team B */}
      <div
        {...clickProps(teamB)}
        className={`flex items-center justify-between py-1 gap-2 ${
          bHi ? 'text-primary' : hasResult ? 'text-muted' : 'text-secondary'
        }${interactive(teamB)}`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {seed?.b != null && (
            <span className="text-label-caps text-muted flex-shrink-0">({seed.b})</span>
          )}
          {bWon && <span className="text-label-caps text-tertiary flex-shrink-0">W</span>}
          <span className={`text-xs truncate ${bLead ? 'font-semibold' : ''}`}>{teamName(teamB)}</span>
        </div>
        {pointsB != null && (
          <span className={`text-sm font-bold flex-shrink-0 ${bHi ? 'text-tertiary' : ''}`}>
            {fmt(pointsB)}
          </span>
        )}
      </div>
    </div>
  );
}
