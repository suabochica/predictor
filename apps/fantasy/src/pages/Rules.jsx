import compositeScoringConfig from '../config/composite_scoring.json';

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
  return (
    <div className="space-y-8 max-w-3xl pb-8">
      <div>
        <h1 className="text-2xl font-bold text-primary">Reglas</h1>
        <p className="text-secondary mt-1">
          Guía completa de la Fantasy League del Mundial FIFA 2026
        </p>
      </div>

      {/* Descripción general */}
      <Section title="Descripción general">
        <p className="text-secondary">
          Liga privada de fantasy football para el Mundial de Fútbol 2026. Hasta 12 participantes
          compiten a lo largo del torneo: primero en un formato de liga (fase de grupos + octavos de
          final del Mundial) y luego en una eliminatoria directa (cuartos de final en adelante).
        </p>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            ['Participantes', 'Máx. 12'],
            ['Plantilla', '15 jugadores'],
            ['Presupuesto', '105 M'],
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
          La fantasy sigue el calendario del Mundial. Las jornadas de liga coinciden con las fases
          reales del torneo:
        </p>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 pr-4 text-muted font-medium">Fase fantasy</th>
              <th className="text-left py-2 pr-4 text-muted font-medium">Fase real del Mundial</th>
              <th className="text-left py-2 text-muted font-medium">Usuarios activos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {[
              ['Liga — Partidos jugados 1-3', 'Fase de grupos (Partidos jugados 1-3)', '12'],
              ['Eliminatoria — Cuartos', 'Dieciseisavos de final del Mundial', '8'],
              ['Eliminatoria — Semis', 'Octavos de final del Mundial', '4'],
              ['Eliminatoria — Final', 'Cuartos de final del Mundial', '2'],
            ].map(([phase, wc, users]) => (
              <tr key={phase}>
                <td className="py-2 pr-4 text-primary">{phase}</td>
                <td className="py-2 pr-4 text-secondary">{wc}</td>
                <td className="py-2 text-secondary">{users}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* Plantilla */}
      <Section title="Plantilla y presupuesto">
        <ul className="space-y-2 text-secondary">
          <li><Bullet />Cada equipo tiene <strong className="text-primary">15 jugadores</strong> con propiedad exclusiva — ningún otro equipo puede tener el mismo jugador.</li>
          <li><Bullet />El presupuesto total es de <strong className="text-primary">105 M</strong>. Tu equipo no puede superar ese límite en ningún momento.</li>
          <li><Bullet />Debes tener al menos <strong className="text-primary">1 portero</strong> en la plantilla en todo momento.</li>
          <li><Bullet />Las posiciones son: <strong className="text-primary">PT, DEF, MED, DEL</strong> (sin formación fija — elige la que prefieras siempre que haya exactamente 1 portero en el once inicial).</li>
        </ul>
      </Section>

      {/* Subasta */}
      <Section title="Subasta por rondas (pretemporada)">
        <p className="text-secondary mb-3">
          Antes del inicio del Mundial, todos los participantes se reúnen en una subasta en tiempo
          real para pujar por los mejores jugadores.
        </p>
        <ul className="space-y-2 text-secondary">
          <li><Bullet />La subasta funciona por <strong className="text-primary">rondas de 3 minutos</strong>. Durante cada ronda puedes colocar pujas sobre varios jugadores a la vez.</li>
          <li><Bullet />Al final de cada ronda se revelan las pujas más altas y quién las hizo. Si te superan, puedes subir tu puja en la siguiente ronda.</li>
          <li><Bullet /><strong className="text-primary">Puja mínima:</strong> precio actual del jugador. <strong className="text-primary">Incremento mínimo:</strong> 0,3 M.</li>
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
          participante puede adquirirlos libremente hasta completar su plantilla de 15. El precio
          descuenta del presupuesto restante y la propiedad sigue siendo exclusiva.
        </p>
      </Section>

      {/* Alineación */}
      <Section title="Alineación y jornadas">
        <ul className="space-y-2 text-secondary">
          <li><Bullet />Selecciona <strong className="text-primary">11 titulares</strong> de tu plantilla de 15 y elige un <strong className="text-primary">capitán</strong> (sus puntos se multiplican por 2).</li>
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
        <ul className="space-y-2 text-secondary">
          <li><Bullet />Los 12 participantes acumulan puntos durante <strong className="text-primary">3 jornadas</strong> (JJ1-JJ3, fase de grupos).</li>
          <li><Bullet />Clasificación por puntos totales. En caso de empate: número de goles anotados por los jugadores propios en el torneo.</li>
          <li><Bullet />Los <strong className="text-primary">8 primeros</strong> pasan a la eliminatoria. Los 4 últimos quedan eliminados de la competición.</li>
        </ul>
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
              <th className="text-left py-2 pr-4 text-muted font-medium">Fase del Mundial</th>
              <th className="text-left py-2 text-muted font-medium">Enfrentamientos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-secondary">
            <tr><td className="py-2 pr-4">Cuartos (8→4)</td><td className="py-2 pr-4">Dieciseisavos</td><td>1.º vs 8.º · 4.º vs 5.º · 2.º vs 7.º · 3.º vs 6.º</td></tr>
            <tr><td className="py-2 pr-4">Semis (4→2)</td><td className="py-2 pr-4">Octavos</td><td>Ganadores de cuartos</td></tr>
            <tr><td className="py-2 pr-4">Final (2→1)</td><td className="py-2 pr-4">Cuartos de final</td><td>Los dos finalistas</td></tr>
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

      {/* Jugadores eliminados */}
      <Section title="Jugadores cuya selección queda eliminada">
        <p className="text-secondary">
          Si la selección de un jugador es eliminada del Mundial real, ese jugador puntúa 0 en las
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
