"""
Build a pivot-friendly APT38 graph using the Ronin Network hack as the concrete
anchor. Uses typed Maltego entities (Domain, IPv4Address, AS, Netblock, Phrase)
so Maltego renders them with distinctive icons and they become pivotable with
Maltego's built-in transforms (ToDNSName, Reverse DNS, certificate transparency,
etc.).

All data is from public, verifiable sources:
- Whois for skymavis.com and roninchain.com (live lookup 2026-04-19)
- DNS A records (live via nslookup 2026-04-19)
- US Treasury OFAC SDN list (April 14, 2022 designation of the Ronin attacker wallet)
- FBI attribution of Ronin hack to Lazarus/APT38 (April 14, 2022)
"""
import math
import os
import zipfile
from xml.etree.ElementTree import Element, SubElement, tostring

MTG = "http://maltego.paterva.com/xml/mtgx"
GML = "http://graphml.graphdrawing.org/xmlns"

# Entity-type-specific property names for the primary value field.
# These are per the standard Maltego ontology / pymtgx reference.
TYPE_VALUE_PROP = {
    "maltego.Phrase": "text",
    "maltego.Domain": "fqdn",
    "maltego.IPv4Address": "ipv4-address",
    "maltego.IPv6Address": "ipv6-address",
    "maltego.AS": "as.number",
    "maltego.Netblock": "ipv4-range",
    "maltego.EmailAddress": "email",
    "maltego.URL": "short-title",
    "maltego.Hash": "properties.hash",
    "maltego.Website": "fqdn",
    "maltego.Company": "title",
    "maltego.Person": "person.fullname",
}


def value_prop_for(entity_type: str) -> str:
    return TYPE_VALUE_PROP.get(entity_type, "text")


# Entity definitions: list of (type, value, extra_properties)
# Normalize: "Domain" -> "maltego.Domain" etc.
RAW_ENTITIES = [
    # Actor + attribution
    ("Phrase", "[Actor] APT38 (Lazarus subgroup)",
     {"country": "DPRK", "first_observed": "2014", "source": "MITRE ATT&CK G0082"}),
    ("Phrase", "[Attribution] FBI (April 14, 2022)",
     {"source": "https://www.fbi.gov/news/press-releases/fbi-statement-on-attribution-of-malicious-cyber-activity-posed-by-the-democratic-peoples-republic-of-korea",
      "attributed_to": "Lazarus Group / APT38 / DPRK"}),
    ("Phrase", "[Attribution] US Treasury OFAC (April 14, 2022)",
     {"source": "https://home.treasury.gov/news/press-releases/jy0731",
      "sanctions_program": "CYBER2",
      "designated": "Lazarus Group-attributed wallet address"}),

    # Campaign
    ("Phrase", "[Campaign] Ronin Network Hack (March 23, 2022)",
     {"loss_usd": "~$625M",
      "assets_stolen": "173,600 ETH + 25.5M USDC",
      "initial_access": "spearphishing (fake LinkedIn job offer PDF)",
      "vector": "compromised private validator keys"}),

    # Victim organizations
    ("Phrase", "[Victim Org] Sky Mavis (parent of Axie Infinity)",
     {"location": "Ho Chi Minh City, Vietnam / Singapore",
      "product": "Axie Infinity / Ronin sidechain"}),

    # Victim domains (real, live)
    ("Domain", "skymavis.com",
     {"role": "victim parent company",
      "registered": "2019-04-04",
      "registrar": "Cloudflare, Inc."}),
    ("Domain", "roninchain.com",
     {"role": "victim product / sidechain",
      "registered": "2020-06-30",
      "registrar": "Cloudflare, Inc."}),

    # Resolved IPs (real, from nslookup 2026-04-19)
    ("IPv4Address", "172.66.154.12",
     {"resolves_from": "skymavis.com",
      "provider": "Cloudflare"}),
    ("IPv4Address", "172.66.152.197",
     {"resolves_from": "roninchain.com",
      "provider": "Cloudflare"}),
    ("IPv4Address", "104.20.36.121",
     {"resolves_from": "roninchain.com",
      "provider": "Cloudflare"}),

    # ASN + Netblock (Cloudflare)
    ("AS", "13335",
     {"organization": "CLOUDFLARENET, US",
      "note": "Victim domains are behind Cloudflare - any original-origin IPs are masked"}),
    ("Netblock", "172.66.0.0/16",
     {"assigned_to": "Cloudflare, Inc."}),

    # Nameservers (Cloudflare-managed, both victims use the same pair)
    ("Domain", "kyle.ns.cloudflare.com",
     {"role": "nameserver"}),
    ("Domain", "violet.ns.cloudflare.com",
     {"role": "nameserver"}),

    # Registrar
    ("Phrase", "[Registrar] Cloudflare, Inc.",
     {"abuse_contact": "registrar-abuse@cloudflare.com",
      "iana_id": "1910"}),

    # Attacker side - OFAC-designated wallet
    ("Phrase", "[IOC OFAC SDN] Ethereum wallet 0x098B716B8Aaf21512996dC57EB0615e2383E2f96",
     {"source": "US Treasury OFAC SDN list",
      "designated_date": "2022-04-14",
      "chain": "Ethereum",
      "role": "recipient of stolen ETH from Ronin bridge",
      "sanction_program": "CYBER2"}),

    # Initial access technique
    ("Phrase", "[T1566.001] Spearphishing Attachment",
     {"source": "MITRE ATT&CK",
      "notes": "APT38 sent senior Sky Mavis engineer a fraudulent LinkedIn job offer containing a malicious PDF"}),

    # Malware / tooling
    ("Phrase", "[Malware] Post-exploitation toolset (custom implants)",
     {"source": "Mandiant / US-CERT",
      "notes": "APT38 custom implants used to pivot from engineer workstation to validator node access"}),
]


def qualify(type_name: str) -> str:
    if type_name.startswith("maltego."):
        return type_name
    return f"maltego.{type_name}"


ENTITIES = [(qualify(t), v, p) for (t, v, p) in RAW_ENTITIES]

# Indices (into ENTITIES) named for readability
I_APT38 = 0
I_FBI = 1
I_OFAC_ATTR = 2
I_CAMPAIGN = 3
I_VICTIM_ORG = 4
I_DOM_SKYMAVIS = 5
I_DOM_RONIN = 6
I_IP_SKYMAVIS = 7
I_IP_RONIN_1 = 8
I_IP_RONIN_2 = 9
I_AS = 10
I_NETBLOCK = 11
I_NS_KYLE = 12
I_NS_VIOLET = 13
I_REGISTRAR = 14
I_WALLET = 15
I_TTP_PHISH = 16
I_MALWARE = 17

LINKS = [
    # APT38 -> attribution sources
    (I_FBI, I_APT38, "attributes to"),
    (I_OFAC_ATTR, I_WALLET, "designates"),
    (I_OFAC_ATTR, I_APT38, "attributes to"),

    # APT38 -> Campaign
    (I_APT38, I_CAMPAIGN, "conducted"),

    # Campaign -> Victim org
    (I_CAMPAIGN, I_VICTIM_ORG, "targeted"),

    # Victim org -> domains
    (I_VICTIM_ORG, I_DOM_SKYMAVIS, "operates"),
    (I_VICTIM_ORG, I_DOM_RONIN, "operates"),

    # Domains -> IPs (real A records)
    (I_DOM_SKYMAVIS, I_IP_SKYMAVIS, "resolves to (A)"),
    (I_DOM_RONIN, I_IP_RONIN_1, "resolves to (A)"),
    (I_DOM_RONIN, I_IP_RONIN_2, "resolves to (A)"),

    # IPs -> AS
    (I_IP_SKYMAVIS, I_AS, "in AS"),
    (I_IP_RONIN_1, I_AS, "in AS"),
    (I_IP_RONIN_2, I_AS, "in AS"),

    # IPs -> Netblock
    (I_IP_SKYMAVIS, I_NETBLOCK, "within"),
    (I_IP_RONIN_1, I_NETBLOCK, "within"),

    # Domains -> Nameservers
    (I_DOM_SKYMAVIS, I_NS_KYLE, "uses NS"),
    (I_DOM_SKYMAVIS, I_NS_VIOLET, "uses NS"),
    (I_DOM_RONIN, I_NS_KYLE, "uses NS"),
    (I_DOM_RONIN, I_NS_VIOLET, "uses NS"),

    # Domains -> Registrar
    (I_DOM_SKYMAVIS, I_REGISTRAR, "registered via"),
    (I_DOM_RONIN, I_REGISTRAR, "registered via"),

    # Attack flow: TTP -> Campaign; Malware -> Campaign
    (I_TTP_PHISH, I_CAMPAIGN, "used in"),
    (I_MALWARE, I_CAMPAIGN, "used in"),

    # Attacker money flow
    (I_CAMPAIGN, I_WALLET, "proceeds traced to"),
]


def make_graphml() -> bytes:
    graphml = Element("graphml", {"xmlns": GML})

    SubElement(graphml, "key", {
        "id": "d0", "for": "node", "attr.name": "MaltegoEntity"
    })
    SubElement(graphml, "key", {
        "id": "d1", "for": "node", "attr.name": "EntityRenderer",
        "yfiles.type": "nodegraphics"
    })
    SubElement(graphml, "key", {
        "id": "d2", "for": "edge", "attr.name": "MaltegoLink"
    })

    graph = SubElement(graphml, "graph", {"edgedefault": "directed"})

    # Layout: central anchor on APT38, concentric rings
    # Ring 0: APT38 (center)
    # Ring 1: Attribution, Campaign, Wallet (story anchors near center)
    # Ring 2: Victim org, TTPs, Malware
    # Ring 3: Domains, Registrar, NS
    # Ring 4: IPs, AS, Netblock
    ring_of = {
        I_APT38: 0,
        I_FBI: 1, I_OFAC_ATTR: 1, I_CAMPAIGN: 1, I_WALLET: 1,
        I_VICTIM_ORG: 2, I_TTP_PHISH: 2, I_MALWARE: 2,
        I_DOM_SKYMAVIS: 3, I_DOM_RONIN: 3, I_REGISTRAR: 3,
        I_NS_KYLE: 3, I_NS_VIOLET: 3,
        I_IP_SKYMAVIS: 4, I_IP_RONIN_1: 4, I_IP_RONIN_2: 4,
        I_AS: 4, I_NETBLOCK: 4,
    }
    ring_radius = {0: 0, 1: 700, 2: 1400, 3: 2100, 4: 2800}

    # Group entities by ring to spread them angularly
    from collections import defaultdict
    by_ring = defaultdict(list)
    for i in range(len(ENTITIES)):
        by_ring[ring_of[i]].append(i)

    positions = {}
    for ring, indices in by_ring.items():
        if ring == 0:
            positions[indices[0]] = (0, 0)
            continue
        radius = ring_radius[ring]
        n = len(indices)
        for idx_pos, i in enumerate(indices):
            angle = 2 * math.pi * idx_pos / n
            x = int(radius * math.cos(angle))
            y = int(radius * math.sin(angle))
            positions[i] = (x, y)

    # Emit nodes
    for i, (etype, value, props) in enumerate(ENTITIES):
        node = SubElement(graph, "node", {"id": f"n{i}"})

        data0 = SubElement(node, "data", {"key": "d0"})
        entity = SubElement(data0, "mtg:MaltegoEntity", {
            "xmlns:mtg": MTG,
            "type": etype
        })
        propsEl = SubElement(entity, "mtg:Properties")

        val_prop_name = value_prop_for(etype)
        primary = SubElement(propsEl, "mtg:Property", {
            "name": val_prop_name, "type": "string"
        })
        SubElement(primary, "mtg:Value").text = value

        for pname, pvalue in props.items():
            pe = SubElement(propsEl, "mtg:Property", {
                "name": pname, "type": "string"
            })
            SubElement(pe, "mtg:Value").text = str(pvalue)

        # Position
        data1 = SubElement(node, "data", {"key": "d1"})
        renderer = SubElement(data1, "mtg:EntityRenderer", {"xmlns:mtg": MTG})
        x, y = positions[i]
        SubElement(renderer, "mtg:Position", {"x": str(x), "y": str(y)})

    # Emit edges
    for i, (a, b, label) in enumerate(LINKS):
        edge = SubElement(graph, "edge", {
            "id": f"e{i}", "source": f"n{a}", "target": f"n{b}"
        })
        data2 = SubElement(edge, "data", {"key": "d2"})
        link = SubElement(data2, "mtg:MaltegoLink", {
            "xmlns:mtg": MTG,
            "type": "maltego.link.manual-link"
        })
        linkProps = SubElement(link, "mtg:Properties")
        labelProp = SubElement(linkProps, "mtg:Property", {
            "name": "maltego.link.manual.type", "type": "string"
        })
        SubElement(labelProp, "mtg:Value").text = label

    xml = b'<?xml version="1.0" encoding="UTF-8"?>\n' + tostring(graphml, encoding="utf-8")
    return xml


def write_mtgx(xml_bytes: bytes, outpath: str) -> None:
    os.makedirs(os.path.dirname(outpath), exist_ok=True)
    with zipfile.ZipFile(outpath, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("Graphs/Graph1.graphml", xml_bytes)
        z.writestr("version.properties",
                   "maltego.graph.version=1.3\nmaltego.client.version=4.11\n")


if __name__ == "__main__":
    out = os.path.expanduser("~/MaltegoGraphs/apt38-pivot.mtgx")
    xml = make_graphml()
    write_mtgx(xml, out)
    print(f"wrote {out}")
    print(f"  graphml: {len(xml)} bytes")
    print(f"  entities: {len(ENTITIES)}")
    print(f"  links: {len(LINKS)}")
    # Count by type
    from collections import Counter
    c = Counter(e[0] for e in ENTITIES)
    for t, n in c.most_common():
        print(f"    {t}: {n}")
