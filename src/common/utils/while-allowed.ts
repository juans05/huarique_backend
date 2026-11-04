import { Observable, catchError, concatMap, filter, from, interval, of, takeUntil } from 'rxjs';

/**
 * Corta un stream en vivo cuando se pierde el acceso (p. ej. quitan al usuario del equipo).
 * Si la comprobación falla por un error pasajero de la base, el stream sigue: solo un "no" explícito lo cierra.
 */
export function whileAllowed<T>(stream: Observable<T>, stillAllowed: () => Promise<boolean>, everyMs = 60_000): Observable<T> {
    const revoked = interval(everyMs).pipe(
        concatMap(() => from(stillAllowed()).pipe(catchError(() => of(true)))),
        filter((ok) => !ok),
    );
    return stream.pipe(takeUntil(revoked));
}
