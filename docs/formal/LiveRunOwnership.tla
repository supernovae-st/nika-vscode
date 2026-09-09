------------------------- MODULE LiveRunOwnership -------------------------
EXTENDS Naturals, FiniteSets

CONSTANTS MaxRequests, EarlyRelease, AcceptStale
Requests == 1..MaxRequests
None == 0

VARIABLES issued, owner, pending, alive, spawned, superseded, signals, badPaint
vars == <<issued, owner, pending, alive, spawned, superseded, signals, badPaint>>

Init == /\ issued = 0
        /\ owner = None
        /\ pending = None
        /\ alive = {}
        /\ spawned = {}
        /\ superseded = {}
        /\ signals = [r \in Requests |-> 0]
        /\ badPaint = FALSE

\* A single latest-intent slot, never a queue of executable requests.
Request ==
    /\ issued < MaxRequests
    /\ issued' = issued + 1
    /\ pending' = issued + 1
    /\ IF owner = None
          THEN /\ UNCHANGED <<owner, superseded, signals>>
          ELSE /\ superseded' = superseded \cup {owner}
               /\ signals' = [signals EXCEPT ![owner] = IF @ = 0 THEN 1 ELSE @]
               /\ owner' = IF EarlyRelease THEN None ELSE owner
    /\ UNCHANGED <<alive, spawned, badPaint>>

\* Production starts synchronously when idle or after close. Splitting
\* start from close here also admits intervening stop/replacement requests.
Start ==
    /\ owner = None
    /\ pending # None
    /\ owner' = pending
    /\ alive' = alive \cup {pending}
    /\ spawned' = spawned \cup {pending}
    /\ pending' = None
    /\ UNCHANGED <<issued, superseded, signals, badPaint>>

Stop ==
    /\ owner # None \/ pending # None
    /\ pending' = None
    /\ IF owner = None
          THEN UNCHANGED <<owner, signals>>
          ELSE /\ signals' = [signals EXCEPT ![owner] = IF @ = 0 THEN 1 ELSE @]
               /\ owner' = IF EarlyRelease THEN None ELSE owner
    /\ UNCHANGED <<issued, alive, spawned, superseded, badPaint>>

Escalate ==
    /\ owner # None
    /\ signals[owner] = 1
    /\ signals' = [signals EXCEPT ![owner] = 2]
    /\ UNCHANGED <<issued, owner, pending, alive, spawned, superseded, badPaint>>

\* The environment may close late or never. A signal/timeout is NOT close.
Close(r) ==
    /\ r \in alive
    /\ alive' = alive \ {r}
    /\ owner' = IF owner = r THEN None ELSE owner
    /\ UNCHANGED <<issued, pending, spawned, superseded, signals, badPaint>>

\* Delivery may outlive its owner. Only accepted publication is observed.
Paint(r) ==
    /\ r \in spawned
    /\ LET authorized == r = owner /\ r \notin superseded
       IN /\ AcceptStale \/ authorized
          /\ badPaint' = (badPaint \/ ~authorized)
    /\ UNCHANGED <<issued, owner, pending, alive, spawned, superseded, signals>>

Next == Request \/ Start \/ Stop \/ Escalate
        \/ (\E r \in Requests : Close(r) \/ Paint(r))
Spec == Init /\ [][Next]_vars

TypeOK == /\ issued \in 0..MaxRequests
          /\ owner \in Requests \cup {None}
          /\ pending \in Requests \cup {None}
          /\ alive \subseteq Requests
          /\ spawned \subseteq Requests
          /\ alive \subseteq spawned
          /\ superseded \subseteq Requests
          /\ signals \in [Requests -> 0..2]
          /\ badPaint \in BOOLEAN
SingleProcess == Cardinality(alive) <= 1
OwnerUntilClose == alive \subseteq {owner}
NoGhostOwner == owner = None \/ owner \in alive
LatestIntent == pending = None \/ pending = issued
NoStalePublication == ~badPaint

=============================================================================
