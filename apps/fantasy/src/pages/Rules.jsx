import compositeScoringConfig from '../config/composite_scoring.json';
import { useCompetition } from '../context/CompetitionContext';
import { competitionCopy } from '../config/competitionCopy';

// "105.0" → "105", "0.3" → "0,3" — the money formatting this page already used.
const money = (n) => String(Number(n)).replace('.', ',');

const COMPOSITE_STAT_LABELS = {
  shots_on_target:  'Tiros a puerta',
  shots_off_target: 'Tiros fuera',
  blocked_shots:    'Tiros bloqueados',
  tackles:          'Entradas',
  interceptions:    'Interceptaciones',
  passes:           'Pases',
  crosses:          'Centros',
  fouls_won:        'Faltas recibidas',
  fouls_conceded:   'Faltas cometidas',
  offsides:         'Fuera de juego',
  penalties_won:    'Penaltis ganados',
};

export default function HowToPlay() {
  const { competition } = useCompetition();
  const copy = competitionCopy(competition);
  const maxParticipants = competition?.max_participants ?? 12;
  const squadSize       = competition?.max_squad_size ?? 15;
  const budget          = money(competition?.budget ?? 105);
  const minIncrement    = money(competition?.min_bid_increment ?? 0.3);
  const knockoutCap     = competition?.transfer_cap_knockout ?? 5;
  const isH2H           = competition?.group_format === 'h2h';
  const h2hWinPts        = money(competition?.h2h_win_points ?? 3.0);
  const h2hDrawPts       = money(competition?.h2h_draw_points ?? 1.0);
  const h2hNarrowLossPts = money(competition?.h2h_narrow_loss_points ?? 0.5);
  const h2hNarrowMargin  = money(competition?.h2h_narrow_loss_margin ?? 5.0);
  const leagueMatchdayCount = copy.calendarRows?.filter(([phase]) => phase.startsWith('Liga')).length ?? 3;

  return (
    <div className="space-y-8 max-w-3xl pb-8">
      <div>
        <h1 className="text-2xl font-bold text-primary">Reglas</h1>
        <p className="text-secondary mt-1">
          Guía completa de la Fantasy League{competition?.name ? ` — ${competition.name}` : ''}
        </p>
      </div>

      {/* Descripción general */}
      <Section title="Descripción general">
        <p className="text-secondary">
          Liga privada de fantasy football para {competition?.name ?? 'la competición'}. Hasta{' '}
          {maxParticipants} participantes compiten a lo largo del torneo: primero en un formato de
          liga y luego en una eliminatoria directa entre los 8 mejores.
        </p>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            ['Participantes', `Máx. ${maxParticipants}`],
            ['Plantilla', `${squadSize} jugadores`],
            ['Presupuesto', `${budget} M`],
            ['Capitán', '×2 puntos'],
          ].map(([label, value]) => (
            <div key={label} className="bg-neutral rounded-lg p-3 text-center">
              <p className="text-xs text-muted uppercase tracking-wider">{label}</p>
              <p className="text-sm font-semibold text-primary mt-0.5">{value}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Calendario */}
      <Section title="Calendario de la competición">
        <p className="text-secondary mb-3">
          La fantasy sigue el calendario {copy.tournamentPossessive}. Las jornadas de liga coinciden
          con las fases reales del torneo:
        </p>
        {!copy.calendarRows ? (
          <p className="text-muted text-sm">
            El calendario de esta competición aún no está publicado. Consulta la sección «Gestión de
            jornadas» para ver las jornadas ya creadas.
          </p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-4 text-muted font-medium">Fase fantasy</th>
                <th className="text-left py-2 pr-4 text-muted font-medium">Fase real {copy.tournamentPossessive}</th>
                <th className="text-left py-2 text-muted font-medium">Usuarios activos</th>
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

      {/* Plantilla */}
      <Section title="Plantilla y presupuesto">
        <ul className="space-y-2 text-secondary">
          <li><Bullet />Cada equipo tiene <strong className="text-primary">{squadSize} jugadores</strong> con propiedad exclusiva — ningún otro equipo puede tener el mismo jugador.</li>
          <li><Bullet />El presupuesto total es de <strong className="text-primary">{budget} M</strong>. Tu equipo no puede superar ese límite en ningún momento.</li>
          <li><Bullet />Debes tener al menos <strong className="text-primary">1 portero</strong> en la plantilla en todo momento.</li>
          <li><Bullet />Las posiciones son: <strong className="text-primary">PT, DEF, MED, DEL</strong> (sin formación fija — elige la que prefieras siempre que haya exactamente 1 portero en el once inicial).</li>
        </ul>
      </Section>

      {/* Subasta */}
      <Section title="Subasta por rondas (pretemporada)">
        <p className="text-secondary mb-3">
          Antes del inicio {copy.tournamentPossessive}, todos los participantes se reúnen en una
          subasta en tiempo real para pujar por los mejores jugadores.
        </p>
        <ul className="space-y-2 text-secondary">
          <li><Bullet />La subasta funciona por <strong className="text-primary">rondas de 3 minutos</strong>. Durante cada ronda puedes colocar pujas sobre varios jugadores a la vez.</li>
          <li><Bullet />Al final de cada ronda se revelan las pujas más altas y quién las hizo. Si te superan, puedes subir tu puja en la siguiente ronda.</li>
          <li><Bullet /><strong className="text-primary">Puja mínima:</strong> precio actual del jugador. <strong className="text-primary">Incremento mínimo:</strong> {minIncrement} M.</li>
          <li><Bullet />El jugador que ganas pasa a ser <strong className="text-primary">exclusivamente tuyo</strong> y desaparece del resto de listas.</li>
          <li><Bullet />La subasta termina cuando pasa una ronda entera sin nuevas pujas, o cuando el administrador la cierra.</li>
          <li><Bullet /><strong className="text-primary">En caso de empate en la puja</strong>: gana quien pujó primero (por marca de tiempo).</li>
        </ul>
      </Section>

      {/* Lista de Pujas Automáticas */}
      <Section title="Lista de Pujas Automáticas">
        <p className="text-secondary mb-3">
          Antes de que comience la subasta puedes configurar tu lista de hasta {' '}
          <strong className="text-primary">30 jugadores</strong> ordenados por prioridad, cada uno con un precio máximo.
        </p>
        <ul className="space-y-2 text-secondary">
          <li><Bullet />Cada jugador de la lista lleva un <strong className="text-primary">precio máximo</strong>: el sistema nunca pujará por encima de ese importe.</li>
          <li><Bullet />Si activas <strong className="text-primary">Subasta Automática</strong>, el sistema puja automáticamente en el minuto 1:30 de cada ronda, siguiendo el orden de prioridad de tu lista.</li>
          <li><Bullet />La lista es <strong className="text-primary">editable</strong> mientras la subasta esté en estado «pendiente»; queda bloqueada en cuanto la subasta se inicia.</li>
        </ul>
      </Section>

      {/* Mercado */}
      <Section title="Mercado abierto (tras la subasta)">
        <p className="text-secondary">
          Los jugadores no reclamados en la subasta pasan al mercado abierto, donde cualquier
          participante puede adquirirlos libremente hasta completar su plantilla de {squadSize}. El precio
          descuenta del presupuesto restante y la propiedad sigue siendo exclusiva.
        </p>
      </Section>

      {/* Alineación */}
      <Section title="Alineación y jornadas">
        <ul className="space-y-2 text-secondary">
          <li><Bullet />Selecciona <strong className="text-primary">11 titulares</strong> de tu plantilla de {squadSize} y elige un <strong className="text-primary">capitán</strong> (sus puntos se multiplican por 2).</li>
          <li><Bullet /><strong className="text-primary">Solo puntúan tus 11 titulares.</strong> Los puntos de la jornada son la suma de los 11 titulares (el capitán cuenta ×2). Los suplentes <strong className="text-primary">no puntúan</strong>, aunque hayan jugado.</li>
          <li><Bullet /><strong className="text-primary">No hay sustituciones automáticas.</strong> Si un titular no juega ni un minuto, suma <strong className="text-primary">0</strong> esa jornada — la banca no lo reemplaza. El orden de la banca (1–4) es solo organizativo.</li>
          <li><Bullet /><strong className="text-primary">Bloqueo por partido:</strong> un jugador se bloquea 10 minutos antes del inicio de su partido — a partir de entonces, no puedes cambiarlo ni elegirlo como capitán.</li>
          <li><Bullet />Los jugadores cuyo partido aún no ha comenzado pueden modificarse libremente (titulares, suplentes, capitán).</li>
          <li><Bullet />Si no guardas alineación, se usa la de la jornada anterior (o la mejor por precio si es la primera jornada).</li>
        </ul>
        <div className="mt-4 bg-info/10 border border-info/30 rounded-lg p-3 text-sm text-secondary">
          <strong className="text-info">Consejo:</strong> ningún jugador se sustituye automáticamente. Si un titular —o tu capitán— no juega, suma 0 esa jornada (y para el capitán, 0 × 2 = 0). Elige bien tu once y tu capitán.
        </div>
      </Section>

      {/* Puntos */}
      <Section title="Sistema de puntos">
        <p className="text-secondary mb-3">
          El sistema por defecto es <strong className="text-primary">Compuesto (FPL+)</strong>. El administrador también puede activar el sistema <strong className="text-primary">FPL</strong> clásico. El sistema activo se anuncia antes de calcular cada jornada.
        </p>
        <p className="text-secondary mb-3">
          El total de la jornada de tu equipo = suma de los puntos de los <strong className="text-primary">11 titulares</strong>, con el capitán ×2. La banca no aporta puntos.
        </p>

        <p className="text-xs text-muted uppercase tracking-wider mb-2">Sistema FPL (base)</p>
        <table className="w-full text-sm border-collapse mb-4">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-1.5 pr-4 text-muted font-medium">Acción</th>
              <th className="text-left py-1.5 text-muted font-medium">Puntos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-secondary">
            <tr><td className="py-1.5 pr-4">Jugar 1-59 min</td><td>+1</td></tr>
            <tr><td className="py-1.5 pr-4">Jugar 60+ min</td><td>+2</td></tr>
            <tr><td className="py-1.5 pr-4">Gol (DEL)</td><td>+4</td></tr>
            <tr><td className="py-1.5 pr-4">Gol (MED)</td><td>+5</td></tr>
            <tr><td className="py-1.5 pr-4">Gol (DEF / PT)</td><td>+6</td></tr>
            <tr><td className="py-1.5 pr-4">Asistencia</td><td>+3</td></tr>
            <tr><td className="py-1.5 pr-4">Portería a cero (60+ min) — PT / DEF</td><td>+4</td></tr>
            <tr><td className="py-1.5 pr-4">Portería a cero (60+ min) — MED</td><td>+1</td></tr>
            <tr><td className="py-1.5 pr-4">Cada 3 paradas (PT)</td><td>+1</td></tr>
            <tr><td className="py-1.5 pr-4">Penalti detenido (PT)</td><td>+5</td></tr>
            <tr><td className="py-1.5 pr-4">Tarjeta amarilla</td><td>−1</td></tr>
            <tr><td className="py-1.5 pr-4">Tarjeta roja</td><td>−3</td></tr>
            <tr><td className="py-1.5 pr-4">Gol en propia puerta</td><td>−2</td></tr>
            <tr><td className="py-1.5 pr-4">Penalti fallado</td><td>−2</td></tr>
            <tr><td className="py-1.5 pr-4">Cada 2 goles encajados (PT / DEF)</td><td>−1</td></tr>
          </tbody>
        </table>

        <p className="text-xs text-muted uppercase tracking-wider mb-2 mt-4">Sistema Compuesto (FPL+) — por defecto</p>
        <p className="text-secondary text-sm mb-3">
          El sistema Compuesto suma la puntuación FPL base más bonos por estadísticas de rendimiento que el FPL no contempla (sin doble conteo con goles, asistencias, portería a cero, tarjetas ni paradas). El penalti fallado <em>no aplica</em> en este sistema (los datos Opta no lo incluyen).
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse mb-2">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-1.5 pr-4 text-muted font-medium">Estadística</th>
                <th className="text-right py-1.5 px-2 text-muted font-medium">PT</th>
                <th className="text-right py-1.5 px-2 text-muted font-medium">DEF</th>
                <th className="text-right py-1.5 px-2 text-muted font-medium">MED</th>
                <th className="text-right py-1.5 px-2 text-muted font-medium">DEL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-secondary">
              {Object.entries(compositeScoringConfig.bonuses).map(([col, weights]) => (
                <tr key={col}>
                  <td className="py-1.5 pr-4">{COMPOSITE_STAT_LABELS[col] ?? col}</td>
                  <td className="py-1.5 px-2 text-right">{weights.GK > 0 ? `+${weights.GK}` : weights.GK}</td>
                  <td className="py-1.5 px-2 text-right">{weights.DEF > 0 ? `+${weights.DEF}` : weights.DEF}</td>
                  <td className="py-1.5 px-2 text-right">{weights.MID > 0 ? `+${weights.MID}` : weights.MID}</td>
                  <td className="py-1.5 px-2 text-right">{weights.FWD > 0 ? `+${weights.FWD}` : weights.FWD}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted mt-1">Puntos por ocurrencia (p. ej. un DEF con portería a cero, 48 pases, 1 entrada e 1 interceptación gana ≈ 8.6 pts en total).</p>
      </Section>

      {/* Transferencias */}
      <Section title="Ventanas de transferencias">
        <p className="text-secondary mb-3">
          Las transferencias se hacen durante las ventanas que se abren entre jornadas. Puedes
          cambiar cualquier jugador de tu plantilla por uno que no pertenezca a nadie.
        </p>
        <table className="w-full text-sm border-collapse mb-3">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 pr-4 text-muted font-medium">Ventana</th>
              <th className="text-left py-2 text-muted font-medium">Límite de transferencias</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-secondary">
            <tr><td className="py-2 pr-4">Pretemporada</td><td className="font-medium text-tertiary">Ilimitadas</td></tr>
            <tr><td className="py-2 pr-4">Entre jornadas de liga (fase de grupos)</td><td>2 por ventana</td></tr>
            <tr><td className="py-2 pr-4">Entre rondas eliminatorias</td><td>5 por ventana</td></tr>
          </tbody>
        </table>
        <ul className="space-y-2 text-secondary text-sm">
          <li><Bullet />Un jugador cuyo partido ya ha comenzado <strong className="text-primary">no se puede transferir</strong> hasta la siguiente ventana.</li>
          <li><Bullet />El presupuesto total (105 M) debe respetarse después de cada transferencia.</li>
          <li><Bullet />Si el jugador que entra cuesta más que el que sale, la diferencia se descuenta del presupuesto (y viceversa).</li>
        </ul>
      </Section>

      {/* Clasificación de liga */}
      <Section title="Fase de liga">
        {isH2H ? (
          <ul className="space-y-2 text-secondary">
            <li><Bullet />Los {maxParticipants} participantes juegan una liga <strong className="text-primary">cabeza a cabeza (H2H)</strong> durante <strong className="text-primary">{leagueMatchdayCount} jornadas</strong>: cada jornada te enfrentas a un rival distinto y nunca repites rival en toda la fase.</li>
            <li><Bullet />En cada enfrentamiento se comparan los puntos fantasy de <strong className="text-primary">esa jornada</strong> (no el total acumulado):
              <ul className="mt-1 ml-4 space-y-0.5">
                <li>Ganas el enfrentamiento → <strong className="text-primary">{h2hWinPts} pts</strong></li>
                <li>Empate → <strong className="text-primary">{h2hDrawPts} pt</strong></li>
                <li>Pierdes por un margen de hasta {h2hNarrowMargin} pts → <strong className="text-primary">{h2hNarrowLossPts} pt</strong></li>
                <li>Pierdes por más de {h2hNarrowMargin} pts → <strong className="text-primary">0 pts</strong></li>
              </ul>
            </li>
            <li><Bullet />Clasificación por puntos de liga. En caso de empate: (1) puntos fantasy totales de la fase de liga, (2) goles anotados por los jugadores propios, (3) puntos del capitán acumulados en la fase de liga.</li>
            <li><Bullet />Los <strong className="text-primary">8 primeros</strong> pasan a la eliminatoria. Los últimos quedan eliminados de la competición.</li>
          </ul>
        ) : (
          <ul className="space-y-2 text-secondary">
            <li><Bullet />Los {maxParticipants} participantes acumulan puntos durante <strong className="text-primary">{leagueMatchdayCount} jornadas</strong> (JJ1-JJ3, fase de grupos).</li>
            <li><Bullet />Clasificación por puntos totales. En caso de empate: número de goles anotados por los jugadores propios en el torneo.</li>
            <li><Bullet />Los <strong className="text-primary">8 primeros</strong> pasan a la eliminatoria. Los 4 últimos quedan eliminados de la competición.</li>
          </ul>
        )}
      </Section>

      {/* Eliminatoria */}
      <Section title="Fase eliminatoria (top 8)">
        <p className="text-secondary mb-3">
          Eliminatoria directa de 3 rondas. El que pierde queda eliminado; no hay reclasificación
          ni bracket de consolación.
        </p>
        <table className="w-full text-sm border-collapse mb-3">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 pr-4 text-muted font-medium">Ronda fantasy</th>
              {copy.knockoutRealStages && (
                <th className="text-left py-2 pr-4 text-muted font-medium">Fase {copy.tournamentPossessive}</th>
              )}
              <th className="text-left py-2 text-muted font-medium">Enfrentamientos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-secondary">
            {[
              ['Cuartos (8→4)', '1.º vs 8.º · 4.º vs 5.º · 2.º vs 7.º · 3.º vs 6.º'],
              ['Semis (4→2)', 'Ganadores de cuartos'],
              ['Final (2→1)', 'Los dos finalistas'],
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
          En cada enfrentamiento se comparan los puntos de <strong className="text-primary">esa jornada</strong> (no el total acumulado).
        </p>
        <div className="bg-surface border border-border rounded-lg p-3 text-sm text-secondary">
          <strong className="text-primary">Desempate H2H</strong> (en caso de igualdad de puntos):
          <ol className="mt-1 space-y-1 list-decimal list-inside">
            <li>Puntos del capitán esa jornada</li>
            <li>Goles marcados por jugadores propios esa jornada</li>
            <li>Posición en la clasificación de liga</li>
          </ol>
        </div>
      </Section>

      {/* Negociaciones a puerta cerrada */}
      <Section title="Negociaciones a puerta cerrada">
        <p className="text-secondary mb-3">
          Cuando un equipo fantasy queda <strong className="text-primary">eliminado</strong> de la
          competición, sus jugadores cuyo equipo real <strong className="text-primary">sigue vivo</strong> en
          {' '}{copy.tournament} no se congelan: el administrador puede abrir una <strong className="text-primary">ventana
          de negociación a puerta cerrada</strong> en la que los equipos que siguen compitiendo pujan por
          ellos mediante <strong className="text-primary">ofertas selladas</strong>.
        </p>
        <ul className="space-y-2 text-secondary">
          <li><Bullet /><strong className="text-primary">Qué jugadores entran:</strong> solo los de equipos fantasy eliminados cuyo equipo real sigue vivo en {copy.tournament}. Si el equipo real del jugador también fue eliminado, no entra (puntuaría 0).</li>
          <li><Bullet /><strong className="text-primary">Quién puede ofertar:</strong> solo los equipos que siguen en competición. Los equipos eliminados ven la ventana en modo solo lectura.</li>
          <li><Bullet /><strong className="text-primary">La oferta:</strong> ofreces exactamente <strong className="text-primary">uno de tus jugadores</strong> más (opcional) <strong className="text-primary">efectivo</strong> de tu presupuesto. El total (precio de tu jugador + efectivo) debe ser <strong className="text-primary">al menos el precio</strong> del jugador objetivo.</li>
          <li><Bullet /><strong className="text-primary">Ofertas selladas:</strong> nadie —ni siquiera el administrador— ve el monto ni quién oferta. Lo único público es <strong className="text-primary">cuántas</strong> ofertas hay por cada jugador (un contador), nunca de quién ni por cuánto.</li>
          <li><Bullet /><strong className="text-primary">Límites:</strong> una oferta activa por jugador objetivo, y cada jugador tuyo puede comprometerse en una sola oferta a la vez. El efectivo comprometido no puede superar tu presupuesto, y tus ofertas activas + transferencias ya usadas comparten el <strong className="text-primary">límite de {knockoutCap}</strong> de la ventana eliminatoria. Siempre debes conservar al menos <strong className="text-primary">1 portero</strong>.</li>
          <li><Bullet /><strong className="text-primary">Puedes retirar</strong> una oferta y volver a ofertar mientras la ventana siga abierta.</li>
          <li><Bullet /><strong className="text-primary">Cierre:</strong> la ventana cierra automáticamente <strong className="text-primary">1 hora antes</strong> del primer partido de la jornada elegida.</li>
        </ul>
        <div className="mt-4 bg-surface border border-border rounded-lg p-3 text-sm text-secondary">
          <strong className="text-primary">Cómo se resuelve</strong> (al cerrar la ventana):
          <ol className="mt-1 space-y-1 list-decimal list-inside">
            <li>Por cada jugador objetivo gana la oferta con el <strong className="text-primary">total más alto</strong> (precio del jugador ofrecido + efectivo). En caso de empate, gana la oferta <strong className="text-primary">más antigua</strong>.</li>
            <li>El ganador recibe al jugador; el jugador que ofreciste <strong className="text-primary">queda libre</strong> (vuelve al mercado, no pasa al equipo eliminado) y el efectivo se descuenta de tu presupuesto. Tu alineación se actualiza sola: el jugador que entra ocupa el sitio del que sale.</li>
            <li>Los que no ganan <strong className="text-primary">conservan sus jugadores</strong> intactos.</li>
            <li>Al terminar, <strong className="text-primary">todos los jugadores restantes</strong> de los equipos eliminados quedan libres y vuelven al mercado abierto para cualquiera.</li>
          </ol>
        </div>
        <div className="mt-3 bg-info/10 border border-info/30 rounded-lg p-3 text-sm text-secondary">
          <strong className="text-info">¿Por qué negociar?</strong> Es tu oportunidad de <strong className="text-primary">asegurar</strong> a un jugador concreto todavía vivo antes de que, al cerrar la ventana, todos los sobrantes salgan al mercado abierto donde cualquiera puede quedárselos por orden de llegada.
        </div>
      </Section>

      {/* Jugadores eliminados */}
      <Section title="Jugadores cuyo equipo real queda eliminado">
        <p className="text-secondary">
          Si el equipo real de un jugador es eliminado {copy.tournamentPossessive}, ese jugador puntúa 0 en las
          jornadas restantes pero <strong className="text-primary">sigue siendo tuyo</strong> — no vuelve al mercado.
          Puedes transferirlo durante la siguiente ventana si prefieres invertir el presupuesto en
          un jugador activo.
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="bg-surface border border-border rounded-xl p-5">
      <h2 className="text-base font-semibold text-primary mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Bullet() {
  return <span className="inline-block w-1.5 h-1.5 rounded-full bg-tertiary mr-2 mb-0.5 align-middle" />;
}
