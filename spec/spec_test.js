
const pb = require("./spec_pb")
const js = require("./spec_json")

var log = console.log.bind(console)

function TestProtoSpec() {
    log("start test proto")

    let s = new pb.Spec()
    let d = new pb.Dialog({info:"test"})
    s.getDialogsMap()["test"] = d

    log("spec", JSON.stringify(s))
    log("end test proto")
}

function TestJsSpec() {
    log("start test js")
    let s1 = new js.Spec()

    let s = new js.Spec({
        icons: {
            ico1: { name: "ico1" },
            ico2: { name: "ico2" },
        },
        parts: {
            p1: { title: "titel1" },
            t1: { text: "text1"},
        }
    })

    let dump = JSON.stringify(s)
    log("dump", s)

    log("end test js")
}

TestProtoSpec()
TestJsSpec()