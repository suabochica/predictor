import { useEffect, useMemo, useState } from 'react';
import { useTeam } from '../hooks/useTeam';
import { useNegotiation } from '../hooks/useNegotiation';
import { useLang } from '@predictor/i18n/react';
import { formatDateTimeShort, formatDate } from '@predictor/i18n';
import { formatPrice, getPositionColor } from '../lib/utils';

export default function Negotiations() {
  const { t, tPlural, lang } = useLang();
  const { team, players: squadRows, loading: teamLoading } = useTeam();
  const {
    window: negWindow,
    isOpen,
    pool,
    counts,
    myOffers,
    committedCash,
    committedPlayerIds,
    offersRemaining,
    history,
    loading,
    submitOffer,
    withdrawOffer,
  } = useNegotiation();

  const [offerTarget, setOfferTarget] = useState(null);
  const [offerOut, setOfferOut] = useState(null);
  const [cash, setCash] = useState('0');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [withdrawingId, setWithdrawingId] = useState(null);
  const [confirmWithdraw, setConfirmWithdraw] = useState(null);

  const squad = useMemo(
    () =>
      squadRows.map((tp) => ({
        id: tp.player_id,
        name: tp.players?.name ?? t('fantasy.common.unknownPlayer'),
        country: tp.players?.country ?? '',
        position: tp.players?.position ?? 'FWD',
        current_price: tp.players?.current_price ?? tp.acquisition_price ?? 0,
      })),
    [squadRows, t]
  );

  const budget = team?.budget_remaining ?? 0;
  const eliminated = team?.status === 'eliminated';
  const activeOffers = myOffers.filter((o) => o.status === 'active');

  function openOfferModal(player) {
    setOfferTarget(player);
    setOfferOut(null);
    setCash('0');
    setFormError(null);
  }

  function closeOfferModal() {
    setOfferTarget(null);
    setOfferOut(null);
    setFormError(null);
  }

  const cashNum = Number(cash) || 0;
  const total = offerOut ? Number((offerOut.current_price + cashNum).toFixed(1)) : 0;
  const meetsMin = offerTarget ? total >= offerTarget.current_price : false;
  const maxCash = Number((budget - committedCash).toFixed(1));

  async function handleSubmit() {
    if (!offerTarget || !offerOut) return;
    setSubmitting(true);
    setFormError(null);
    const { error } = await submitOffer(offerTarget.id, offerOut.id, cashNum);
    setSubmitting(false);
    if (error) {
      setFormError(error);
      return;
    }
    closeOfferModal();
  }

  async function handleWithdraw(offerId) {
    setWithdrawingId(offerId);
    await withdrawOffer(offerId);
    setWithdrawingId(null);
    setConfirmWithdraw(null);
  }

  if (teamLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20 text-secondary">
        {t('fantasy.negotiations.loading')}
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-primary">{t('fantasy.negotiations.title')}</h1>
        <p className="text-secondary text-sm mt-0.5">
          {t('fantasy.negotiations.subtitle')}
        </p>
      </div>

      {eliminated && (
        <div className="bg-surface border border-error/30 rounded-xl p-4 text-center">
          <p className="text-error font-semibold">{t('fantasy.common.eliminatedReadOnly')}</p>
          <p className="text-secondary text-sm mt-1">
            {t('fantasy.negotiations.eliminatedBody')}
          </p>
        </div>
      )}

      {!negWindow || !isOpen ? (
        <div className="bg-surface border border-border rounded-xl p-6 text-center text-secondary">
          {t('fantasy.negotiations.noneActive')}
        </div>
      ) : (
        <>
          <NegotiationCountdown closesAt={negWindow.closes_at} t={t} lang={lang} />

          {!eliminated && (
            <div className="bg-surface border border-border rounded-xl px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-label-caps text-muted uppercase tracking-wider">{t('fantasy.negotiations.availableBudget')}</p>
                <p className="text-base font-bold text-tertiary">{formatPrice(budget - committedCash)}</p>
                {committedCash > 0 && (
                  <p className="text-xs text-muted mt-0.5">{t('fantasy.common.amountCommitted', { amount: formatPrice(committedCash) })}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-label-caps text-muted uppercase tracking-wider">{t('fantasy.negotiations.offersRemaining')}</p>
                <p className="text-base font-bold text-primary">{offersRemaining}</p>
              </div>
            </div>
          )}

          {/* My offers */}
          {activeOffers.length > 0 && (
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-sm font-semibold text-secondary">{t('fantasy.negotiations.myOffers')}</h3>
              </div>
              <div className="divide-y divide-border">
                {activeOffers.map((o) => (
                  <div key={o.id} className="px-4 py-3 flex items-center gap-3 flex-wrap text-sm">
                    <span className="text-tertiary font-medium">
                      {o.target?.name ?? t('fantasy.common.playerFallback', { id: o.target_player_id })}
                    </span>
                    <span className="text-muted">←</span>
                    <span className="text-error">{o.offered?.name ?? t('fantasy.common.playerFallback', { id: o.offered_player_id })}</span>
                    <span className="text-secondary">+ {formatPrice(o.cash)}</span>
                    <span className="text-xs text-muted ml-auto">
                      {formatDateTimeShort(o.created_at, lang)}
                    </span>
                    {!eliminated &&
                      (confirmWithdraw === o.id ? (
                        <span className="flex items-center gap-2">
                          <button
                            onClick={() => handleWithdraw(o.id)}
                            disabled={withdrawingId === o.id}
                            className="text-xs font-semibold text-error hover:underline disabled:opacity-50"
                          >
                            {withdrawingId === o.id ? t('fantasy.negotiations.withdrawing') : t('fantasy.negotiations.confirm')}
                          </button>
                          <button
                            onClick={() => setConfirmWithdraw(null)}
                            className="text-xs text-secondary hover:underline"
                          >
                            {t('fantasy.common.cancel')}
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirmWithdraw(o.id)}
                          className="text-xs font-semibold text-secondary hover:text-error hover:underline"
                        >
                          {t('fantasy.negotiations.withdraw')}
                        </button>
                      ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pool */}
          {pool.length === 0 ? (
            <div className="text-center py-12 text-muted">
              {t('fantasy.negotiations.poolEmpty')}
            </div>
          ) : (
            <div className="space-y-4">
              {pool.map((group) => (
                <div key={group.teamId} className="bg-surface border border-border rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-border">
                    <h3 className="text-sm font-semibold text-secondary">{group.teamName}</h3>
                  </div>
                  <div className="divide-y divide-border">
                    {group.players.map((p) => {
                      const myActiveOffer = activeOffers.find((o) => o.target_player_id === p.id);
                      const count = counts[p.id] ?? 0;
                      return (
                        <div key={p.id} className="px-4 py-3 flex items-center gap-3 flex-wrap text-sm">
                          <span
                            className={`text-xs font-bold px-2 py-1 rounded flex-shrink-0 ${getPositionColor(p.position)}`}
                          >
                            {p.position}
                          </span>
                          <span className="text-primary font-medium">{p.name}</span>
                          <span className="text-muted text-xs">{p.country}</span>
                          <span className="text-tertiary font-semibold">{formatPrice(p.current_price)}</span>
                          {count > 0 && (
                            <span className="text-label-caps text-info font-semibold text-xs px-2 py-0.5 rounded-full bg-info/10">
                              {tPlural('fantasy.negotiations.offerCount', count, { n: count })}
                            </span>
                          )}
                          {myActiveOffer && (
                            <span className="text-label-caps text-tertiary font-semibold text-xs">{t('fantasy.negotiations.yourOffer')}</span>
                          )}
                          {!eliminated && (
                            <button
                              onClick={() => openOfferModal(p)}
                              disabled={!!myActiveOffer || offersRemaining <= 0}
                              className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-lg bg-tertiary hover:brightness-90 text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {myActiveOffer ? t('fantasy.negotiations.offered') : t('fantasy.negotiations.makeOffer')}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {history.length > 0 && <NegotiationHistory groups={history} t={t} lang={lang} />}

      {/* Offer modal */}
      {offerTarget && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && !submitting && closeOfferModal()}
        >
          <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-2xl">
            <h2 className="text-lg font-bold text-primary">{t('fantasy.negotiations.modal.heading', { name: offerTarget.name })}</h2>
            <p className="text-xs text-muted">
              {t('fantasy.negotiations.modal.sealedNotice')}
            </p>

            <div className="bg-tertiary/5 border border-tertiary/40 rounded-xl p-3 flex items-center gap-3">
              <span
                className={`text-xs font-bold px-2 py-1 rounded flex-shrink-0 ${getPositionColor(offerTarget.position)}`}
              >
                {offerTarget.position}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-label-caps text-tertiary font-semibold mb-0.5">{t('fantasy.negotiations.modal.target')}</p>
                <p className="text-sm font-semibold text-primary truncate">{offerTarget.name}</p>
              </div>
              <span className="text-sm font-bold text-tertiary flex-shrink-0">
                {formatPrice(offerTarget.current_price)}
              </span>
            </div>

            <div className="space-y-1.5">
              <p className="text-label-caps text-muted uppercase tracking-wider">{t('fantasy.negotiations.modal.yourPlayer')}</p>
              <div className="max-h-40 overflow-y-auto space-y-0.5">
                {squad
                  .filter((p) => !committedPlayerIds.has(p.id))
                  .map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setOfferOut(p)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors ${
                        offerOut?.id === p.id ? 'ring-2 ring-error bg-error/5' : 'hover:bg-border/50'
                      }`}
                    >
                      <span
                        className={`text-label-caps font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${getPositionColor(p.position)}`}
                      >
                        {p.position}
                      </span>
                      <span className="text-sm text-primary flex-1 truncate">{p.name}</span>
                      <span className="text-xs text-tertiary flex-shrink-0">{formatPrice(p.current_price)}</span>
                    </button>
                  ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-label-caps text-muted uppercase tracking-wider" htmlFor="neg-cash">
                {t('fantasy.negotiations.modal.additionalCash')}
              </label>
              <input
                id="neg-cash"
                type="number"
                step="0.1"
                min="0"
                max={maxCash}
                value={cash}
                onChange={(e) => setCash(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface-hover border border-border text-primary text-sm focus:outline-none focus:ring-2 focus:ring-tertiary"
              />
              <p className="text-xs text-muted">{t('fantasy.negotiations.modal.maxAvailable', { amount: formatPrice(maxCash) })}</p>
            </div>

            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-secondary">
                <span>{t('fantasy.negotiations.modal.totalOffered')}</span>
                <span className={meetsMin ? 'text-tertiary font-semibold' : 'text-error font-semibold'}>
                  {formatPrice(total)}
                </span>
              </div>
              <div className="flex justify-between text-secondary">
                <span>{t('fantasy.negotiations.modal.minRequired')}</span>
                <span className="text-primary">{formatPrice(offerTarget.current_price)}</span>
              </div>
            </div>

            {formError && (
              <p className="text-xs text-error" role="alert">
                {formError}
              </p>
            )}

            <div className="flex gap-3">
              <button
                onClick={closeOfferModal}
                disabled={submitting}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-surface-hover text-secondary hover:bg-border transition-colors disabled:opacity-50"
              >
                {t('fantasy.common.cancel')}
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || !offerOut || !meetsMin || cashNum > maxCash || cashNum < 0}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-tertiary hover:brightness-90 text-primary transition-colors disabled:opacity-50"
              >
                {submitting ? t('fantasy.negotiations.modal.sending') : t('fantasy.negotiations.modal.submit')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NegotiationCountdown({ closesAt, t, lang }) {
  const [remaining, setRemaining] = useState(() => new Date(closesAt).getTime() - Date.now());

  useEffect(() => {
    const id = setInterval(() => setRemaining(new Date(closesAt).getTime() - Date.now()), 1000);
    return () => clearInterval(id);
  }, [closesAt]);

  const clamped = Math.max(0, remaining);
  const hours = Math.floor(clamped / 3600000);
  const minutes = Math.floor((clamped % 3600000) / 60000);
  const seconds = Math.floor((clamped % 60000) / 1000);

  return (
    <div className="bg-info/10 border border-info/30 rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">
      <div>
        <p className="text-info font-semibold">{t('fantasy.negotiations.windowOpen')}</p>
        <p className="text-secondary text-sm mt-0.5">{t('fantasy.negotiations.closesAt', { date: formatDateTimeShort(closesAt, lang) })}</p>
      </div>
      <span className="text-2xl font-mono font-bold tabular-nums text-info">
        {String(hours).padStart(2, '0')}:{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </span>
    </div>
  );
}

function NegotiationHistory({ groups, t, lang }) {
  const [expandedId, setExpandedId] = useState(groups[0]?.windowId ?? null);

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold text-primary">{t('fantasy.negotiations.history.heading')}</h2>
      <div className="space-y-3">
        {groups.map((g) => {
          const expanded = expandedId === g.windowId;
          return (
            <div key={g.windowId} className="bg-surface border border-border rounded-xl overflow-hidden">
              <button
                onClick={() => setExpandedId(expanded ? null : g.windowId)}
                className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-surface-hover transition-colors"
              >
                <h3 className="text-sm font-semibold text-secondary">
                  {t('fantasy.negotiations.history.round', { n: g.fantasyRound })}
                  {g.resolvedAt && (
                    <span className="text-xs text-muted font-normal ml-2">
                      {t('fantasy.negotiations.history.resolvedOn', { date: formatDate(g.resolvedAt, lang) })}
                    </span>
                  )}
                </h3>
                <span className="text-muted text-xs">{expanded ? '▲' : '▼'}</span>
              </button>
              {expanded && (
                <div className="divide-y divide-border">
                  {g.sales.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-muted">{t('fantasy.negotiations.history.noSales')}</p>
                  ) : (
                    g.sales.map((sale) => (
                      <div key={sale.target?.name ?? Math.random()} className="px-4 py-3 space-y-2 text-sm">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span
                            className={`text-xs font-bold px-2 py-1 rounded flex-shrink-0 ${getPositionColor(sale.target?.position)}`}
                          >
                            {sale.target?.position}
                          </span>
                          <span className="text-primary font-medium">{sale.target?.name}</span>
                          <span className="text-muted">←</span>
                          <span className="text-error">{sale.winner.offered?.name}</span>
                          <span className="text-secondary">+ {formatPrice(sale.winner.cash)}</span>
                          <span className="text-tertiary font-semibold">= {formatPrice(sale.winner.total)}</span>
                        </div>
                        <p className="text-xs text-tertiary font-semibold">{t('fantasy.negotiations.history.soldTo', { name: sale.winner.teamName })}</p>
                        {sale.losers.length > 0 && (
                          <div className="pl-2 space-y-1">
                            <p className="text-label-caps text-muted uppercase tracking-wider">{t('fantasy.negotiations.history.otherOffers')}</p>
                            {sale.losers.map((l, i) => (
                              <p key={i} className="text-xs text-muted">
                                {l.teamName} — {l.offered?.name} + {formatPrice(l.cash)} = {formatPrice(l.total)}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
