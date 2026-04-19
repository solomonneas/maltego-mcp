"""
One-off script to regenerate apt38-starter.mtgx using the pymtgx reference format,
which Maltego actually opens cleanly. Used to unblock the APT38 play session while
we figure out what's wrong with our TypeScript writer.
"""
import os
import zipfile
from xml.etree.ElementTree import Element, SubElement, tostring

MTG = "http://maltego.paterva.com/xml/mtgx"
GML = "http://graphml.graphdrawing.org/xmlns"
YFILES = "http://www.yworks.com/xml/graphml"

# For maltego.Phrase the display property is "text"
PHRASE_PROP = "text"
LINK_TYPE = "maltego.link.manual-link"
LINK_PROP = "maltego.link.manual.type"

# Entity definitions: id -> (value, optional properties dict)
ENTITIES = [
    ("[Actor] APT38", {"country": "DPRK", "first_observed": "2014", "source": "MITRE G0082"}),
    ("[Alias] Lazarus Group", {}),
    ("[Alias] BeagleBoyz (CISA)", {}),
    ("[Alias] HIDDEN COBRA (US-CERT)", {}),
    ("[Alias] Bluenoroff (Kaspersky)", {}),
    ("[Attribution] DPRK Reconnaissance General Bureau", {}),
    ("[T1566.001] Spearphishing Attachment", {}),
    ("[T1190] Exploit Public-Facing Application", {}),
    ("[T1078] Valid Accounts", {}),
    ("[T1071.001] Application Layer Protocol: Web Protocols", {}),
    ("[T1048] Exfiltration Over Alternative Protocol", {}),
    ("[T1027] Obfuscated Files or Information", {}),
    ("[T1486] Data Encrypted for Impact", {}),
    ("[Malware] FASTCash (ATM cash-out)", {}),
    ("[Malware] DYEPACK (SWIFT manipulation)", {}),
    ("[Malware] KEYMARBLE (RAT)", {}),
    ("[Malware] HERMES ransomware", {}),
    ("[Malware] BADCALL (proxy)", {}),
    ("[Campaign] Bangladesh Bank heist 2016 ($81M)", {}),
    ("[Campaign] Polish banks 2017", {}),
    ("[Campaign] Bancomext Mexico 2018", {}),
    ("[Campaign] Cosmos Bank India 2018", {}),
    ("[Campaign] Banco de Chile 2018", {}),
    ("[Campaign] Ronin Network / Axie Infinity 2022 ($625M)", {}),
    ("[Sector] Financial institutions (SWIFT network)", {}),
    ("[Sector] Cryptocurrency exchanges", {}),
    ("[Sector] ATM infrastructure", {}),
    ("[IOC OFAC SDN] 0x098B716B8Aaf21512996dC57EB0615e2383E2f96",
     {"source": "US Treasury OFAC SDN list April 2022", "chain": "Ethereum", "type": "attacker wallet"}),
]

# (from_index, to_index, label) - 0-based indices into ENTITIES
LINKS = [
    (0, 1, "subgroup of"),
    (0, 2, "known as"),
    (0, 3, "known as"),
    (0, 4, "known as"),
    (0, 5, "attributed to"),
    (0, 6, "uses technique"),
    (0, 7, "uses technique"),
    (0, 8, "uses technique"),
    (0, 9, "uses technique"),
    (0, 10, "uses technique"),
    (0, 11, "uses technique"),
    (0, 12, "uses technique"),
    (0, 13, "deploys"),
    (0, 14, "deploys"),
    (0, 15, "deploys"),
    (0, 16, "deploys"),
    (0, 17, "deploys"),
    (0, 18, "conducted"),
    (0, 19, "conducted"),
    (0, 20, "conducted"),
    (0, 21, "conducted"),
    (0, 22, "conducted"),
    (0, 23, "conducted"),
    (18, 24, "targeted"),
    (19, 24, "targeted"),
    (20, 24, "targeted"),
    (21, 26, "targeted"),
    (22, 24, "targeted"),
    (23, 25, "targeted"),
    (13, 26, "targets"),
    (14, 18, "used in"),
    (16, 22, "used in"),
    (23, 27, "funds traced to"),
    (0, 27, "OFAC-attributed wallet"),
]


def make_graphml():
    graphml = Element("graphml", {"xmlns": GML})

    # Key declarations
    SubElement(graphml, "key", {"id": "d0", "for": "node", "attr.name": "MaltegoEntity"})
    SubElement(graphml, "key", {"id": "d1", "for": "node", "attr.name": "EntityRenderer", "yfiles.type": "nodegraphics"})
    SubElement(graphml, "key", {"id": "d2", "for": "edge", "attr.name": "MaltegoLink"})

    graph = SubElement(graphml, "graph", {"edgedefault": "directed"})

    # Auto-layout: arrange in a rough circle to avoid all-on-origin stacking
    import math
    n = len(ENTITIES)
    radius = 2400
    for i, (value, props) in enumerate(ENTITIES):
        node = SubElement(graph, "node", {"id": f"n{i}"})

        # Entity data
        data0 = SubElement(node, "data", {"key": "d0"})
        entity = SubElement(data0, "mtg:MaltegoEntity", {
            "xmlns:mtg": MTG,
            "type": "maltego.Phrase"
        })
        propsEl = SubElement(entity, "mtg:Properties")
        valProp = SubElement(propsEl, "mtg:Property", {"name": PHRASE_PROP, "type": "string"})
        SubElement(valProp, "mtg:Value").text = value
        for pname, pvalue in props.items():
            pe = SubElement(propsEl, "mtg:Property", {"name": pname, "type": "string"})
            SubElement(pe, "mtg:Value").text = pvalue

        # Position (EntityRenderer with a circular layout)
        data1 = SubElement(node, "data", {"key": "d1"})
        # Place the first entity at center, others on circle
        if i == 0:
            x, y = 0, 0
        else:
            angle = 2 * math.pi * (i - 1) / (n - 1)
            x = int(radius * math.cos(angle))
            y = int(radius * math.sin(angle))
        renderer = SubElement(data1, "mtg:EntityRenderer", {"xmlns:mtg": MTG})
        SubElement(renderer, "mtg:Position", {"x": str(x), "y": str(y)})

    # Edges
    for i, (a, b, label) in enumerate(LINKS):
        edge = SubElement(graph, "edge", {"id": f"e{i}", "source": f"n{a}", "target": f"n{b}"})
        data2 = SubElement(edge, "data", {"key": "d2"})
        link = SubElement(data2, "mtg:MaltegoLink", {
            "xmlns:mtg": MTG,
            "type": LINK_TYPE
        })
        propsEl = SubElement(link, "mtg:Properties")
        labelProp = SubElement(propsEl, "mtg:Property", {"name": LINK_PROP, "type": "string"})
        SubElement(labelProp, "mtg:Value").text = label

    xml = b'<?xml version="1.0" encoding="UTF-8"?>\n' + tostring(graphml, encoding="utf-8")
    return xml


def write_mtgx(xml_bytes, outpath):
    with zipfile.ZipFile(outpath, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("Graphs/Graph1.graphml", xml_bytes)
        z.writestr("version.properties", "maltego.graph.version=1.3\nmaltego.client.version=4.11\n")


if __name__ == "__main__":
    out = os.path.expanduser("~/MaltegoGraphs/apt38-starter.mtgx")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    xml = make_graphml()
    write_mtgx(xml, out)
    print(f"wrote {out} ({len(xml)} bytes graphml, {len(ENTITIES)} entities, {len(LINKS)} links)")
