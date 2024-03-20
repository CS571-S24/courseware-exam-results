const fs = require('fs');
const { exit } = require('process');

const RESP_MAPPER = {
    1: "A",
    2: "B",
    3: "C",
    4: "D",
    5: "E"
}

const csvCanvas = csvToArray(fs.readFileSync('includes/canvas.csv').toString().trim()).slice(1)
const csvGradebook = csvToArray(fs.readFileSync('includes/gradebook.csv').toString().trim()).slice(3)
const csvScantron = csvToArray(fs.readFileSync('includes/scantron.csv').toString().trim()).slice(1)
const answerKeys = JSON.parse(fs.readFileSync('includes/answers.json').toString()).reduce((acc, curr) => {
    return {
        ...acc,
        [curr.version]: curr
    }
}, {})

const header = flatten(["Student", "ID", "SIS User ID", "SIS Login ID", "Section", "Version", "Score", "Possible Score", "Percent Score"].concat(Object.keys(answerKeys[Object.keys(answerKeys)[0]].key).map((k) => [
        `q${k}_response`,
        `q${k}_answer`,
        `q${k}_correct`,
    ])))

if (csvCanvas.some(r => r[2] === "unknown_id")) {
    console.error("canvas.csv is missing 'SIS User ID' entries. Find these in gradebook.csv")
    exit(1)
}

const emails = csvGradebook.reduce((acc, curr) => {
    if (curr[0] === 'Student, Test') {
        return acc;
    }
    return {
        ...acc,
        [curr[2]]: {
            email: curr[3],
            gb: curr.slice(0, 5)
        }
    }
}, {})
const scantronResults = csvScantron.reduce((acc, scanRow) => {
    const scanName = (scanRow[0] + scanRow[1]).replace(/ /g, "")
    const scanId = scanRow[3].trim()
    return {
        ...acc,
        [(scanName ?? "") + (scanId ?? "")]: scanRow
    }
}, {});

const students = csvCanvas.map(r => {
    const matchers = r[0].replace("(", "").replace(")", "").split(" - ")
    const name = matchers[1].trim().replace(/ /g, "");
    const id = matchers[2].trim();

    const deets = scantronResults[(name ?? "") + (id ?? "")];
    const sis = r[2];
    return {
        rawName: name,
        rawId: id,
        email: emails[sis].email,
        gb: emails[sis].gb,
        version: deets[4],
        responses: deets.slice(7).map(choice => RESP_MAPPER[choice])
    }
})

const versions = Object.keys(answerKeys)

const badVers = students.find(stud => !versions.includes(stud.version));
if (badVers) {
    console.error(`In 'scantron.csv', ${badVers.rawName} (${badVers.rawId} - ${badVers.email}) contains a bad version '${badVers.version}'. Expected a version in ${versions}`)
}

const writeCsv = students.map(stud => {
    const grading = stud.responses.map((resp, i) => {
        const ans = answerKeys[stud.version].key[(i + 1) + ''];
        return typeof (ans) === 'string' ? resp === ans : ans.includes(resp)
    })
    const numCorrect = grading.filter(g => g).length
    const numTotal = grading.length
    return [
        ...stud.gb.map(sanitize),
        stud.version,
        numCorrect * answerKeys[stud.version].questionWeight,
        numTotal * answerKeys[stud.version].questionWeight,
        ((numCorrect / numTotal) * 100).toFixed(2),
        ...grading.map((correct, i) => {
            const ansK = answerKeys[stud.version].key[(i + 1) + ''];
            return [
                stud.responses[i],
                typeof(ansK) === "string" ? ansK : ansK.join(" or "),
                correct ? "✅" : "❌"
            ]
        })
    ]
}).join("\n")

// https://stackoverflow.com/questions/19492846/javascript-to-csv-export-encoding-issue
fs.writeFileSync('output.csv', "\uFEFF" + header.join(",") + '\n' + writeCsv)

console.log(`Successfully generated a mail merge for ${students.length} students!`)

// https://stackoverflow.com/questions/8493195/how-can-i-parse-a-csv-string-with-javascript-which-contains-comma-in-data
function csvToArray(text) {
    let p = '', row = [''], ret = [row], i = 0, r = 0, s = !0, l;
    for (l of text) {
        if ('"' === l) {
            if (s && l === p) row[i] += l;
            s = !s;
        } else if (',' === l && s) l = row[++i] = '';
        else if ('\n' === l && s) {
            if ('\r' === p) row[i] = row[i].slice(0, -1);
            row = ret[++r] = [l = '']; i = 0;
        } else row[i] += l;
        p = l;
    }
    return ret;
};

// https://stackoverflow.com/questions/27266550/how-to-flatten-nested-array-in-javascript
function flatten(ary) {
    var ret = [];
    for(var i = 0; i < ary.length; i++) {
        if(Array.isArray(ary[i])) {
            ret = ret.concat(flatten(ary[i]));
        } else {
            ret.push(ary[i]);
        }
    }
    return ret;
}

function sanitize(cell) {
    if (typeof(cell) === 'string') {
        if (cell.includes(",")) {
            return `"${cell}"`
        } else {
            return cell;
        }
    } else {
        return cell;
    }
}