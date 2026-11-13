const UGA_SCHOOL_ID = "U2Nob29sLTExMDE="; // btoa("School-1101") — University of Georgia

const RMP_GQL = "https://www.ratemyprofessors.com/graphql";

const QUERY = `
query TeacherSearchQuery($text: String!, $schoolID: ID!) {
  newSearch {
    teachers(query: {text: $text, schoolID: $schoolID}, first: 5) {
      edges {
        node {
          id
          firstName
          lastName
          avgRating
          avgDifficulty
          numRatings
          wouldTakeAgainPercent
        }
      }
    }
  }
}`;

// Session cache and in-flight deduplication
const cache = new Map();
const pending = new Map();

function normTokens(str) {
    return str
        .normalize("NFD").replace(/[̀-ͯ]/g, "") // strip diacritics
        .toLowerCase()
        .replace(/[^a-z]+/g, " ")                         // hyphens/punctuation → spaces
        .trim().split(/\s+/)
        .filter(t => t.length > 1);                        // drop single-letter initials
}

function tokenMatch(a, b) {
    // Exact match OR one is a prefix of the other (Brad ↔ Bradley, etc.)
    return a === b || a.startsWith(b) || b.startsWith(a);
}

// Returns a match score in [0.6, 1], or -1 if the names don't match
function matchScore(queryName, firstName, lastName) {
    const aTokens = normTokens(queryName);
    const rTokens = normTokens(`${firstName} ${lastName}`);
    if (aTokens.length < 1 || rTokens.length < 1) return -1;

    // Athena's last name must appear EXACTLY in the RMP name. Prefix matching
    // is only for first names (Brad ↔ Bradley); allowing it here would match
    // Lee ↔ Leeds.
    const aLast = aTokens[aTokens.length - 1];
    if (!rTokens.includes(aLast)) return -1;

    // Fraction of RMP tokens that match any Athena token
    const matches = rTokens.filter(rt => aTokens.some(at => tokenMatch(rt, at)));
    const score = matches.length / rTokens.length;
    if (score < 0.6) return -1;

    // Small bonus per exact token so "Li Wang" beats "Lisa Wang" for Li Wang
    const exact = rTokens.filter(rt => aTokens.includes(rt)).length;
    return score + exact * 0.01;
}

function rmpUrl(encodedId) {
    // RMP IDs are base64("Teacher-12345") — extract the numeric part
    const numeric = atob(encodedId).split("-").pop();
    return `https://www.ratemyprofessors.com/professor/${numeric}`;
}

// Returns the best-matching professor, or null if none matched.
// Throws on network/API errors so failures aren't cached as "no rating".
async function queryRMP(searchText, name) {
    const res = await fetch(RMP_GQL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Basic dGVzdDp0ZXN0",
        },
        body: JSON.stringify({
            query: QUERY,
            variables: { text: searchText, schoolID: UGA_SCHOOL_ID },
        }),
    });
    if (!res.ok) throw new Error(`RMP request failed: ${res.status}`);
    const json = await res.json();
    if (!json?.data) throw new Error("RMP returned no data");

    // Pick the highest-scoring match; break ties by number of ratings
    let best = null;
    let bestScore = -1;
    const edges = json.data.newSearch?.teachers?.edges ?? [];
    for (const { node } of edges) {
        const score = matchScore(name, node.firstName, node.lastName);
        if (score < 0) continue;
        if (score > bestScore ||
            (score === bestScore && node.numRatings > best.numRatings)) {
            best = node;
            bestScore = score;
        }
    }
    if (!best) return null;

    return {
        avgRating: best.avgRating,
        avgDifficulty: best.avgDifficulty,
        numRatings: best.numRatings,
        wouldTakeAgainPercent: best.wouldTakeAgainPercent,
        url: rmpUrl(best.id),
    };
}

async function fetchProf(name) {
    const tokens = normTokens(name);
    if (tokens.length < 2) return null;

    // Pass 1: search by full name minus initials ("Bradley Barnes")
    const result = await queryRMP(tokens.join(" "), name);
    if (result) return result;

    // Pass 2: search by last name only so RMP returns all professors with that
    // surname at UGA — catches nicknames like Brad ↔ Bradley that pass 1 misses
    return queryRMP(tokens[tokens.length - 1], name);
}

async function lookupProf(name) {
    if (cache.has(name)) return cache.get(name);
    // Deduplicate concurrent requests for the same name
    if (pending.has(name)) return pending.get(name);

    const promise = fetchProf(name)
        .then(result => {
            // Only cache real answers (including "not found"), never errors,
            // so a transient failure can be retried on the next lookup
            cache.set(name, result);
            return result;
        })
        .catch(() => null)
        .finally(() => pending.delete(name));
    pending.set(name, promise);
    return promise;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "LOOKUP_PROF") {
        lookupProf(msg.name).then(sendResponse);
        return true;
    }
});
