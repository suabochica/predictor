import { Section, Bullet } from './RulesLayout';

export default function RulesEn({
  competitionName,
  maxParticipants,
  squadSize,
  budget,
  minIncrement,
  knockoutCap,
  leagueCap,
  isH2H,
  h2hWinPts,
  h2hDrawPts,
  h2hNarrowLossPts,
  h2hNarrowMargin,
  leagueMatchdayCount,
  eliminatedCount,
  rivalsRepeat,
  copy,
  compositeRows,
}) {
  return (
    <div className="space-y-8 max-w-3xl pb-8">
      <div>
        <h1 className="text-2xl font-bold text-primary">Rules</h1>
        <p className="text-secondary mt-1">
          Complete guide to the Fantasy League{competitionName ? ` — ${competitionName}` : ''}
        </p>
      </div>

      {/* Overview */}
      <Section title="Overview">
        <p className="text-secondary">
          Private fantasy football league for {competitionName ?? 'the competition'}. Up to{' '}
          {maxParticipants} participants compete throughout the tournament: first in a league
          format, then in a straight knockout between the top 8.
        </p>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            ['Participants', `Max ${maxParticipants}`],
            ['Squad', `${squadSize} players`],
            ['Budget', `${budget} M`],
            ['Captain', '×2 points'],
          ].map(([label, value]) => (
            <div key={label} className="bg-neutral rounded-lg p-3 text-center">
              <p className="text-xs text-muted uppercase tracking-wider">{label}</p>
              <p className="text-sm font-semibold text-primary mt-0.5">{value}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Calendar */}
      <Section title="Competition calendar">
        <p className="text-secondary mb-3">
          Fantasy follows the {copy.tournamentPossessive} calendar. League matchdays line up with
          the tournament's real stages:
        </p>
        {!copy.calendarRows ? (
          <p className="text-muted text-sm">
            This competition's calendar hasn't been published yet. Check the "Matchday management"
            section to see the matchdays already created.
          </p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-4 text-muted font-medium">Fantasy phase</th>
                <th className="text-left py-2 pr-4 text-muted font-medium">{copy.tournamentPossessive} stage</th>
                <th className="text-left py-2 text-muted font-medium">Active users</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {copy.calendarRows.map(([phase, real, users]) => (
                <tr key={phase}>
                  <td className="py-2 pr-4 text-primary">{phase}</td>
                  <td className="py-2 pr-4 text-secondary">{real}</td>
                  <td className="py-2 text-secondary">{users}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Squad */}
      <Section title="Squad & budget">
        <ul className="space-y-2 text-secondary">
          <li><Bullet />Each team has <strong className="text-primary">{squadSize} players</strong> under exclusive ownership — no other team can own the same player.</li>
          <li><Bullet />The total budget is <strong className="text-primary">{budget} M</strong>. Your team can never go over that limit.</li>
          <li><Bullet />You must always have at least <strong className="text-primary">1 goalkeeper</strong> in your squad.</li>
          <li><Bullet />Positions are: <strong className="text-primary">GK, DEF, MID, FWD</strong> (no fixed formation — pick whichever you like, as long as your starting XI has exactly 1 goalkeeper).</li>
        </ul>
      </Section>

      {/* Auction */}
      <Section title="Round-based auction (preseason)">
        <p className="text-secondary mb-3">
          Before {copy.tournament} kicks off, every participant joins a live auction to bid for the
          best players.
        </p>
        <ul className="space-y-2 text-secondary">
          <li><Bullet />The auction runs in <strong className="text-primary">3-minute rounds</strong>. During each round you can place bids on several players at once.</li>
          <li><Bullet />At the end of each round, the highest bids — and who made them — are revealed. If you're outbid, you can raise your bid in the next round.</li>
          <li><Bullet /><strong className="text-primary">Minimum bid:</strong> the player's current price. <strong className="text-primary">Minimum increment:</strong> {minIncrement} M.</li>
          <li><Bullet />A player you win becomes <strong className="text-primary">exclusively yours</strong> and disappears from everyone else's lists.</li>
          <li><Bullet />The auction ends once a full round passes with no new bids, or when the admin closes it.</li>
          <li><Bullet /><strong className="text-primary">In case of a tied bid:</strong> whoever bid first wins (by timestamp).</li>
        </ul>
      </Section>

      {/* Auto-Bid List */}
      <Section title="Auto-Bid List">
        <p className="text-secondary mb-3">
          Before the auction starts you can set up a list of up to{' '}
          <strong className="text-primary">30 players</strong> ranked by priority, each with a maximum price.
        </p>
        <ul className="space-y-2 text-secondary">
          <li><Bullet />Every player on the list carries a <strong className="text-primary">maximum price</strong>: the system will never bid above that amount.</li>
          <li><Bullet />If you turn on <strong className="text-primary">Auto-Bid</strong>, the system bids automatically at the 1:30 mark of each round, following your list's priority order.</li>
          <li><Bullet />The list is <strong className="text-primary">editable</strong> while the auction is still "pending"; it locks the moment the auction starts.</li>
        </ul>
      </Section>

      {/* Market */}
      <Section title="Open market (after the auction)">
        <p className="text-secondary">
          Players unclaimed at auction move to the open market, where any participant can freely
          pick them up until their squad reaches {squadSize}. The price is deducted from your
          remaining budget, and ownership stays exclusive.
        </p>
      </Section>

      {/* Lineup */}
      <Section title="Lineup & matchdays">
        <ul className="space-y-2 text-secondary">
          <li><Bullet />Pick <strong className="text-primary">11 starters</strong> from your {squadSize}-player squad and choose a <strong className="text-primary">captain</strong> (their points are doubled).</li>
          <li><Bullet /><strong className="text-primary">Only your 11 starters score.</strong> The matchday total is the sum of the 11 starters' points (captain counts ×2). Substitutes <strong className="text-primary">don't score</strong>, even if they played.</li>
          <li><Bullet /><strong className="text-primary">No automatic substitutions.</strong> If a starter doesn't play a single minute, they score <strong className="text-primary">0</strong> that matchday — the bench doesn't replace them. Bench order (1–4) is for organization only.</li>
          <li><Bullet /><strong className="text-primary">Match lock:</strong> a player locks 10 minutes before their match kicks off — from then on you can't swap them or name them captain.</li>
          <li><Bullet />Players whose match hasn't started yet can still be freely changed (starters, bench, captain).</li>
          <li><Bullet />If you don't save a lineup, the previous matchday's is used (or the highest-priced XI if it's the first matchday).</li>
        </ul>
        <div className="mt-4 bg-info/10 border border-info/30 rounded-lg p-3 text-sm text-secondary">
          <strong className="text-info">Tip:</strong> no player is substituted automatically. If a starter — or your captain — doesn't play, they score 0 that matchday (and for the captain, 0 × 2 = 0). Choose your XI and your captain carefully.
        </div>
      </Section>

      {/* Points */}
      <Section title="Scoring system">
        <p className="text-secondary mb-3">
          The default system is <strong className="text-primary">Composite (FPL+)</strong>. The admin can also switch to the classic <strong className="text-primary">FPL</strong> system. The active system is announced before each matchday is scored.
        </p>
        <p className="text-secondary mb-3">
          Your team's matchday total = the sum of the <strong className="text-primary">11 starters'</strong> points, with the captain ×2. The bench contributes nothing.
        </p>

        <p className="text-xs text-muted uppercase tracking-wider mb-2">FPL system (base)</p>
        <table className="w-full text-sm border-collapse mb-4">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-1.5 pr-4 text-muted font-medium">Action</th>
              <th className="text-left py-1.5 text-muted font-medium">Points</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-secondary">
            <tr><td className="py-1.5 pr-4">Played 1-59 min</td><td>+1</td></tr>
            <tr><td className="py-1.5 pr-4">Played 60+ min</td><td>+2</td></tr>
            <tr><td className="py-1.5 pr-4">Goal (FWD)</td><td>+4</td></tr>
            <tr><td className="py-1.5 pr-4">Goal (MID)</td><td>+5</td></tr>
            <tr><td className="py-1.5 pr-4">Goal (DEF / GK)</td><td>+6</td></tr>
            <tr><td className="py-1.5 pr-4">Assist</td><td>+3</td></tr>
            <tr><td className="py-1.5 pr-4">Clean sheet (60+ min) — GK / DEF</td><td>+4</td></tr>
            <tr><td className="py-1.5 pr-4">Clean sheet (60+ min) — MID</td><td>+1</td></tr>
            <tr><td className="py-1.5 pr-4">Every 3 saves (GK)</td><td>+1</td></tr>
            <tr><td className="py-1.5 pr-4">Penalty save (GK)</td><td>+5</td></tr>
            <tr><td className="py-1.5 pr-4">Yellow card</td><td>−1</td></tr>
            <tr><td className="py-1.5 pr-4">Red card</td><td>−3</td></tr>
            <tr><td className="py-1.5 pr-4">Own goal</td><td>−2</td></tr>
            <tr><td className="py-1.5 pr-4">Penalty miss</td><td>−2</td></tr>
            <tr><td className="py-1.5 pr-4">Every 2 goals conceded (GK / DEF)</td><td>−1</td></tr>
          </tbody>
        </table>

        <p className="text-xs text-muted uppercase tracking-wider mb-2 mt-4">Composite system (FPL+) — default</p>
        <p className="text-secondary text-sm mb-3">
          The Composite system adds the base FPL score plus bonuses for performance stats FPL doesn't cover (no double-counting with goals, assists, clean sheets, cards, or saves). Penalty misses <em>don't apply</em> under this system (the Opta data doesn't include them).
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse mb-2">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-1.5 pr-4 text-muted font-medium">Stat</th>
                <th className="text-right py-1.5 px-2 text-muted font-medium">GK</th>
                <th className="text-right py-1.5 px-2 text-muted font-medium">DEF</th>
                <th className="text-right py-1.5 px-2 text-muted font-medium">MID</th>
                <th className="text-right py-1.5 px-2 text-muted font-medium">FWD</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-secondary">
              {compositeRows.map((row) => (
                <tr key={row.key}>
                  <td className="py-1.5 pr-4">{row.label}</td>
                  <td className="py-1.5 px-2 text-right">{row.GK}</td>
                  <td className="py-1.5 px-2 text-right">{row.DEF}</td>
                  <td className="py-1.5 px-2 text-right">{row.MID}</td>
                  <td className="py-1.5 px-2 text-right">{row.FWD}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted mt-1">Points per occurrence (e.g. a DEF with a clean sheet, 48 passes, 1 tackle and 1 interception earns ≈ 8.6 pts total).</p>
      </Section>

      {/* Transfers */}
      <Section title="Transfer windows">
        <p className="text-secondary mb-3">
          Transfers happen during windows that open between matchdays. You can swap any player in
          your squad for one nobody else owns.
        </p>
        <table className="w-full text-sm border-collapse mb-3">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 pr-4 text-muted font-medium">Window</th>
              <th className="text-left py-2 text-muted font-medium">Transfer limit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-secondary">
            <tr><td className="py-2 pr-4">Preseason</td><td className="font-medium text-tertiary">Unlimited</td></tr>
            <tr><td className="py-2 pr-4">Between league matchdays (group stage)</td><td>{leagueCap} per window</td></tr>
            <tr><td className="py-2 pr-4">Between knockout rounds</td><td>{knockoutCap} per window</td></tr>
          </tbody>
        </table>
        <ul className="space-y-2 text-secondary text-sm">
          <li><Bullet />A player whose match has already started <strong className="text-primary">can't be transferred</strong> until the next window.</li>
          <li><Bullet />The total budget ({budget} M) must be respected after every transfer.</li>
          <li><Bullet />If the incoming player costs more than the outgoing one, the difference is deducted from your budget (and vice versa).</li>
        </ul>
      </Section>

      {/* League stage */}
      <Section title="League stage">
        {isH2H ? (
          <ul className="space-y-2 text-secondary">
            <li><Bullet />The {maxParticipants} participants play a <strong className="text-primary">head-to-head (H2H)</strong> league over <strong className="text-primary">{leagueMatchdayCount} matchdays</strong>: {rivalsRepeat
              ? <>each matchday you face a rival drawn at random; with {maxParticipants} participants there are only {maxParticipants - 1} distinct opponents, so the final matchdays repeat an opponent.</>
              : <>each matchday you face a different rival, and you never repeat an opponent during the whole stage.</>}</li>
            <li><Bullet />Each fixture compares fantasy points for <strong className="text-primary">that matchday only</strong> (not the cumulative total):
              <ul className="mt-1 ml-4 space-y-0.5">
                <li>Win the fixture → <strong className="text-primary">{h2hWinPts} pts</strong></li>
                <li>Draw → <strong className="text-primary">{h2hDrawPts} pt</strong></li>
                <li>Lose by up to {h2hNarrowMargin} pts → <strong className="text-primary">{h2hNarrowLossPts} pt</strong></li>
                <li>Lose by more than {h2hNarrowMargin} pts → <strong className="text-primary">0 pts</strong></li>
              </ul>
            </li>
            <li><Bullet />Ranked by league points. Tiebreaker: (1) total fantasy points in the league stage, (2) goals scored by your own players, (3) accumulated captain points in the league stage.</li>
            <li><Bullet />{eliminatedCount === 0
              ? <>All <strong className="text-primary">8</strong> advance to the knockout; nobody is eliminated in the league stage.</>
              : <>The <strong className="text-primary">top 8</strong> advance to the knockout. The <strong className="text-primary">bottom {eliminatedCount}</strong> are eliminated from the competition.</>}</li>
          </ul>
        ) : (
          <ul className="space-y-2 text-secondary">
            <li><Bullet />The {maxParticipants} participants accumulate points over <strong className="text-primary">{leagueMatchdayCount} matchdays</strong> (MD1-MD{leagueMatchdayCount}, group stage).</li>
            <li><Bullet />Ranked by total points. Tiebreaker: number of goals scored by your own players across the tournament.</li>
            <li><Bullet />The <strong className="text-primary">top 8</strong> advance to the knockout. The <strong className="text-primary">bottom {eliminatedCount}</strong> are eliminated from the competition.</li>
          </ul>
        )}
      </Section>

      {/* Knockout */}
      <Section title="Knockout stage (top 8)">
        <p className="text-secondary mb-3">
          Straight knockout, 3 rounds. The loser is eliminated — no reseeding, no consolation
          bracket.
        </p>
        <table className="w-full text-sm border-collapse mb-3">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 pr-4 text-muted font-medium">Fantasy round</th>
              {copy.knockoutRealStages && (
                <th className="text-left py-2 pr-4 text-muted font-medium">{copy.tournamentPossessive} stage</th>
              )}
              <th className="text-left py-2 text-muted font-medium">Fixtures</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-secondary">
            {[
              ['Quarterfinals (8→4)', '1st vs 8th · 4th vs 5th · 2nd vs 7th · 3rd vs 6th'],
              ['Semifinals (4→2)', 'Quarterfinal winners'],
              ['Final (2→1)', 'The two finalists'],
            ].map(([round, fixtures], i) => (
              <tr key={round}>
                <td className="py-2 pr-4">{round}</td>
                {copy.knockoutRealStages && (
                  <td className="py-2 pr-4">{copy.knockoutRealStages[i]}</td>
                )}
                <td>{fixtures}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-secondary text-sm mb-2">
          Each fixture compares <strong className="text-primary">that matchday's</strong> points only (not the cumulative total).
        </p>
        <div className="bg-surface border border-border rounded-lg p-3 text-sm text-secondary">
          <strong className="text-primary">H2H tiebreaker</strong> (if points are level):
          <ol className="mt-1 space-y-1 list-decimal list-inside">
            <li>Captain's points that matchday</li>
            <li>Goals scored by your own players that matchday</li>
            <li>League standings position</li>
          </ol>
        </div>
      </Section>

      {/* Closed-door negotiations */}
      <Section title="Closed-door negotiations">
        <p className="text-secondary mb-3">
          When a fantasy team is <strong className="text-primary">eliminated</strong> from the
          competition, their players whose real team is <strong className="text-primary">still alive</strong> in
          {' '}{copy.tournament} don't get frozen: the admin can open a <strong className="text-primary">closed-door
          negotiation window</strong> where the teams still competing bid for them through{' '}
          <strong className="text-primary">sealed offers</strong>.
        </p>
        <ul className="space-y-2 text-secondary">
          <li><Bullet /><strong className="text-primary">Which players are eligible:</strong> only players from eliminated fantasy teams whose real team is still alive in {copy.tournament}. If the player's real team was also eliminated, they don't enter (they'd score 0).</li>
          <li><Bullet /><strong className="text-primary">Who can bid:</strong> only teams still in the competition. Eliminated teams see the window in read-only mode.</li>
          <li><Bullet /><strong className="text-primary">The offer:</strong> you offer exactly <strong className="text-primary">one of your players</strong> plus (optionally) <strong className="text-primary">cash</strong> from your budget. The total (your player's price + cash) must be <strong className="text-primary">at least the target player's price</strong>.</li>
          <li><Bullet /><strong className="text-primary">Sealed offers:</strong> nobody — not even the admin — sees the amount or who's bidding. The only public thing is <strong className="text-primary">how many</strong> offers each player has (a counter), never from whom or for how much.</li>
          <li><Bullet /><strong className="text-primary">Limits:</strong> one active offer per target player, and each of your players can be committed to only one offer at a time. Committed cash can't exceed your budget, and your active offers plus transfers already used share the knockout window's <strong className="text-primary">{knockoutCap} limit</strong>. You must always keep at least <strong className="text-primary">1 goalkeeper</strong>.</li>
          <li><Bullet />You can <strong className="text-primary">withdraw</strong> an offer and bid again while the window stays open.</li>
          <li><Bullet /><strong className="text-primary">Closing:</strong> the window closes automatically <strong className="text-primary">1 hour before</strong> the first match of the chosen matchday.</li>
        </ul>
        <div className="mt-4 bg-surface border border-border rounded-lg p-3 text-sm text-secondary">
          <strong className="text-primary">How it's resolved</strong> (when the window closes):
          <ol className="mt-1 space-y-1 list-decimal list-inside">
            <li>For each target player, the offer with the <strong className="text-primary">highest total</strong> wins (offered player's price + cash). Ties go to the <strong className="text-primary">earliest</strong> offer.</li>
            <li>The winner receives the player; the player you offered <strong className="text-primary">becomes a free agent</strong> (returns to the market, not to the eliminated team) and the cash is deducted from your budget. Your lineup updates itself: the incoming player takes the outgoing one's spot.</li>
            <li>Non-winners <strong className="text-primary">keep their players</strong> untouched.</li>
            <li>Once it ends, <strong className="text-primary">every remaining player</strong> from eliminated teams becomes a free agent and returns to the open market for anyone.</li>
          </ol>
        </div>
        <div className="mt-3 bg-info/10 border border-info/30 rounded-lg p-3 text-sm text-secondary">
          <strong className="text-info">Why negotiate?</strong> It's your chance to <strong className="text-primary">lock in</strong> a specific player who's still alive before, once the window closes, every leftover player hits the open market where anyone can grab them first-come, first-served.
        </div>
      </Section>

      {/* Eliminated players */}
      <Section title="Players whose real team is eliminated">
        <p className="text-secondary">
          If a player's real team is eliminated from {copy.tournament}, that player scores 0 for the
          remaining matchdays but <strong className="text-primary">stays yours</strong> — they don't
          return to the market. You can transfer them out during the next window if you'd rather
          invest that budget in an active player.
        </p>
      </Section>
    </div>
  );
}
