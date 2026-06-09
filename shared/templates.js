// Expediting Mailer — templates (gegenereerd uit templates.json). Pas hier teksten aan.
window.EXPEDITING_TEMPLATES = {
  "versie": "0.1-basis",
  "bron": "Expediting_OFT_Templates.zip (5 .oft-bestanden, waarvan 1 met 3 sub-templates)",
  "subject_regel": {
    "formaat": "{URGENT?}{SubProjectID} | PO {PurchaseOrderNo} | {Issue}",
    "urgent_prefix": "URGENT | ",
    "velden": {
      "SubProjectID": "Sub Project ID (kolom F)",
      "PurchaseOrderNo": "Purchase Order No (kolom A)",
      "Issue": "veld 'onderwerp_issue' van het gekozen template"
    },
    "voorbeeld": "URGENT | 63484 | PO 3156019825-1-1 | Statusupdate inkooporder"
  },
  "placeholder_map": {
    "[Naam leverancier]": "Supplier Name",
    "[Supplier Name]": "Supplier Name",
    "[PO-nummer]": "Purchase Order No",
    "[PO number]": "Purchase Order No",
    "[PO Number]": "Purchase Order No",
    "[PO‑regel]": "Purchase Order No",
    "[Design Object-nummer]": "Unified Reference Code",
    "[Design Object Number]": "Unified Reference Code"
  },
  "templates": [
    {
      "id": "last_mile_po_nl",
      "naam": "Statusupdate inkooporder (Last Mile PO)",
      "taal": "NL",
      "onderwerp_issue": "Statusupdate inkooporder",
      "toepasbaar_op_status": [
        "Released",
        "Confirmed"
      ],
      "beschrijving": "Statusupdate-verzoek bij naderende leverdatum, incl. verpakking/labeling en openstaande documentatie.",
      "body_html": "Geachte leverancier,<br>Graag ontvangen wij een statusupdate met betrekking tot Purchase Order [PO-nummer], aangezien de overeengekomen leverdatum nadert.\nWilt u bevestigen of productie en uitlevering volgens planning verlopen?<br>Wij verzoeken u tevens onderstaande verpakkings- en voorbereidingsstappen te volgen:<br>Verpakking & labeling<br>IHC zal een itemlijst aanleveren, welke volledig ingevuld dient te worden (HS-codes, aantallen, verpakkingsdetails).<br>De ingevulde itemlijst dient aan IHC te worden geretourneerd.<br>Na goedkeuring zal IHC de verzendlabels verstrekken.<br>Voorafgaand aan verpakken of bekisten ontvangen wij graag duidelijke foto’s van de artikelen ter verificatie.<br>De aangeleverde labels dienen op alle verpakkingen te worden aangebracht.<br>Dit proces is noodzakelijk om een correcte ontvangst, handling en registratie binnen ons logistiek systeem te waarborgen.<br>Documentatie<br>Graag ontvangen wij een update en, waar beschikbaar, aanlevering van de nog openstaande PO-gerelateerde documentatie, waaronder:<br>Operation & Maintenance Manual<br>Spare Parts List<br>Certificaten / Class-documentatie<br>Overige documentatie zoals overeengekomen in de PO<br>Indien bepaalde documenten nog niet beschikbaar zijn, verzoeken wij u de verwachte aanleverdatum te bevestigen.<br>Belangrijke instructie:\nDe hardcopy van de Operation & Maintenance Manual dient te worden verzonden naar ons hoofdkantoor en mag niet worden meegeleverd met de fysieke zending naar de afleverlocatie.<br>Bij voorbaat dank voor uw medewerking. Uw tijdige reactie helpt om vertragingen te voorkomen.<br>",
      "placeholders": [
        "[PO-nummer]"
      ]
    },
    {
      "id": "last_mile_po_en",
      "naam": "Status update purchase order (Last Mile PO)",
      "taal": "EN",
      "onderwerp_issue": "Status update purchase order",
      "toepasbaar_op_status": [
        "Released",
        "Confirmed"
      ],
      "beschrijving": "Engelse variant van de statusupdate Last Mile PO.",
      "body_html": "Dear Supplier,<br>Please provide a status update for Purchase Order [PO number], as the agreed delivery date is approaching.\nKindly confirm whether production and delivery are on schedule.<br>Please also follow the packaging and preparation steps below:<br>Packaging & Labeling<br>IHC will provide an item list to be completed in full (HS codes, quantities, packaging details).<br>Return the completed item list to IHC.<br>Upon approval, IHC will issue the shipping labels.<br>Before packaging or crating, please send clear photos of the items for verification.<br>Apply the provided labels to all packages.<br>This process is required to ensure correct receipt, handling, and registration in our logistics system.<br>Documentation<br>Please provide an update on — and submit where available — the outstanding PO-related documentation, including:<br>Operation & Maintenance Manual<br>Spare Parts List<br>Certificates / Class documentation<br>Other documentation agreed under the PO<br>If any documents are not yet available, please confirm the expected delivery date.<br>Important instruction:\nThe hardcopy Operation & Maintenance Manual must be sent to our head office and must not be included with the physical shipment to the delivery location.<br>Thank you for your cooperation. Your timely response will help avoid delays.<br>",
      "placeholders": [
        "[PO number]"
      ]
    },
    {
      "id": "fat_protocol_nl",
      "naam": "FAT-protocol & documentatie",
      "taal": "NL",
      "onderwerp_issue": "FAT-protocol & documentatie",
      "toepasbaar_op_status": [
        "Confirmed"
      ],
      "beschrijving": "Verzoek om FAT-protocol en aanvullende documentatie bij naderende assemblage/FAT.",
      "body_html": "Geachte [Naam leverancier],<br>Met het oog op de naderende afronding van de assemblage van [PO‑regel], willen wij graag tijdig afstemmen over de vervolgstappen.<br>Ter voorbereiding op de aankomende Factory Acceptance Test (FAT) en om het proces soepel te laten verlopen, verzoeken wij u vriendelijk om onderstaande informatie.<br>FAT-protocol<br>Wij ontvangen graag het meest recente FAT-protocol ter beoordeling, inclusief:<br>Testscope<br>Acceptatiecriteria<br>Gedetailleerde testprocedures<br>Benodigd testequipment en verantwoordelijkheden<br>Dit stelt ons in staat om intern de juiste voorbereidingen te treffen en alle betrokkenen vooraf goed af te stemmen.<br>Aanvullende vereiste documentatie<br>Ten behoeve van onze documentatie en interne beoordeling verzoeken wij u tevens om de volgende documenten:<br>Bedienings- en onderhoudshandleiding (Operation & Maintenance Manual), indien beschikbaar (digitaal + hardcopy)<br>Spare Parts List<br>Class-certificaten (indien van toepassing)<br>IHM Material Declaration (Inventory of Hazardous Materials)<br>Indien (een deel van) deze documentatie reeds beschikbaar is, ontvangen wij deze graag zo spoedig mogelijk. Mocht dit nog niet het geval zijn, dan verzoeken wij u vriendelijk de verwachte aanleverdata door te geven.<br>Daarnaast verzoeken wij u om de laatst bevestigde leverdatum voor PO [PO-nummer] met ons te delen. Dit helpt ons bij de logistieke planning en de afstemming met onze interne stakeholders.<br>Alvast dank voor uw medewerking. Het tijdig ontvangen van deze informatie stelt ons in staat efficiënt te werken en vertragingen in de FAT-voorbereiding te voorkomen.<br>Mocht u vanuit uw zijde nog aanvullende informatie nodig hebben, dan horen wij dat uiteraard graag.",
      "placeholders": [
        "[Naam leverancier]",
        "[PO-nummer]",
        "[PO‑regel]"
      ]
    },
    {
      "id": "documentatie_verzoek_nl",
      "naam": "Formeel documentatieverzoek",
      "taal": "NL",
      "onderwerp_issue": "Documentatieverzoek",
      "toepasbaar_op_status": [
        "Confirmed",
        "Received",
        "Arrived"
      ],
      "beschrijving": "Formeel verzoek om volledige projectdocumentatie (5 werkdagen) voorafgaand aan overdracht.",
      "body_html": "Geachte [Naam leverancier],<br>Hierbij doen wij een formeel verzoek met betrekking tot de documentatie die verbonden is aan:<br>Inkooporder (PO): [PO-nummer]<br>Design Object: [Design Object-nummer]<br>Wij informeren u dat wij momenteel een interne administratieve controle uitvoeren en een verplichte eindcontrole van de projectdocumentatie voorafgaand aan overdracht.\nIn het kader van onze contractuele verplichtingen en conform de van toepassing zijnde wet- en regelgeving verzoeken wij u vriendelijk doch dringend om alle documentatie te verstrekken die relevant is voor uw leveringsomvang onder bovengenoemde PO.<br>Dit verzoek omvat — maar is niet beperkt tot — de volgende documenten:<br>Gevraagde documentatie (voor zover van toepassing)<br>As-built tekeningen<br>Bankgarantie<br>Basic Engineering tekeningen<br>Classificatiecertificaat<br>Commissioningprocedure<br>Ontwerpdocumentatie<br>Maatrapport / Dimensional Inspection<br>Engineeringinformatie<br>Factory Acceptance Test (FAT) resultaten<br>IHM Material Declaration<br>Makers Test Certificate<br>Handleidingen<br>Materiaalcertificaat 3.2<br>MED Certificate B<br>MED Certificate – Declaration of Conformity<br>MED Certificate DEF<br>Spare Part List<br>Type Approval Certificate<br>Weight Report<br>Wij verzoeken u hierbij om:<br>Alle voor uw levering relevante documenten volledig en zonder omissies te verstrekken;<br>Te waarborgen dat alle aangeleverde documenten de meest recente en definitieve revisies betreffen, conform contractuele vereisten.<br>Wij verzoeken u deze informatie te verstrekken binnen vijf (5) werkdagen na ontvangst van deze kennisgeving, tenzij anders schriftelijk overeengekomen.<br>Het niet aanleveren van volledige documentatie kan gevolgen hebben voor projectcertificering, overdrachtsverplichtingen en naleving van wettelijke voorschriften, en kan leiden tot verdere contractuele maatregelen indien van toepassing.<br>Voor vragen of nadere toelichting kunt u uiteraard contact met ons opnemen.",
      "placeholders": [
        "[Design Object-nummer]",
        "[Naam leverancier]",
        "[PO-nummer]"
      ]
    },
    {
      "id": "documentatie_verzoek_en",
      "naam": "Formal documentation request",
      "taal": "EN",
      "onderwerp_issue": "Documentation request",
      "toepasbaar_op_status": [
        "Confirmed",
        "Received",
        "Arrived"
      ],
      "beschrijving": "Engelse variant van het formele documentatieverzoek (binnen het Last Mile-bestand).",
      "body_html": "Dear [Supplier Name],<br>We hereby issue this formal request concerning the documentation associated with:<br>Purchase Order (PO): [PO Number]<br>Design Object Number: [Design Object Number]<br>Please be informed that we are currently conducting an internal administrative reconciliation and/or performing a final mandatory documentation review prior to contractual handover.\nIn accordance with our contractual obligations and applicable regulatory requirements, we request that you provide all documentation relevant to your supplied scope under the above-referenced PO.<br>This request includes, but is not limited to, the following:<br>Requested Documentation (where applicable)<br>As-Built Drawings<br>Bank Guarantee<br>Basic Engineering Drawings<br>Class Certificate<br>Commissioning Procedure<br>Design Documentation<br>Dimensional Inspection Reports<br>Engineering Information<br>Factory Acceptance Test (FAT) Results<br>IHM Material Declaration<br>Makers Test Certificate<br>Manuals<br>Material Certificate 3.2<br>MED Certificate B<br>MED Certificate – Declaration of Conformity<br>MED Certificate DEF<br>Spare Part List<br>Type Approval Certificate<br>Weight Report<br>To ensure compliance and completeness of our project records, you are requested to:<br>Provide all documentation applicable to your scope of supply, without omission.<br>Ensure that all documents submitted are the latest, final, and contractually compliant revisions.<br>We kindly request your response within five (5) working days of receipt of this notice, unless otherwise agreed in writing.<br>Failure to provide the required documentation may affect project certification, handover obligations, and regulatory compliance, and may result in subsequent contractual actions where applicable.<br>Should you have any questions or require clarification regarding this request, please contact us promptly.<br>Thank you for your cooperation.",
      "placeholders": [
        "[Design Object Number]",
        "[PO Number]",
        "[Supplier Name]"
      ]
    },
    {
      "id": "onaangekondigde_levering_nl",
      "naam": "Onaangekondigde levering",
      "taal": "NL",
      "onderwerp_issue": "Onaangekondigde levering",
      "toepasbaar_op_status": [
        "Released",
        "Confirmed",
        "Planned"
      ],
      "beschrijving": "Waarschuwing dat onaangekondigde leveringen worden geweigerd; aankondigingsvereisten.",
      "body_html": "Geachte Leverancier,<br>Graag willen wij u wijzen op het volgende: leveringen die zonder voorafgaande aankondiging bij onze locatie arriveren, worden niet geaccepteerd.<br>De afgelopen periode hebben wij meerdere keren te maken gehad met onaangekondigde goederenontvangsten.<br>Dit veroorzaakt aanzienlijke verstoringen in onze dagelijkse operatie. Wanneer materialen ongepland binnenkomen, leidt dit onder andere tot:<br>blokkades en gebrek aan ruimte,<br>onveilige situaties,<br>vertragingen in de planning,<br>fouten in registratie en kwaliteitscontrole.<br>Om een veilige en efficiënte logistieke omgeving te waarborgen, is het verplicht dat elke levering van tevoren wordt aangekondigd, met vermelding van:<br>Onze labels<br>PO-nummer / Projectnummer<br>Pakbon<br>Eventuele bijzonderheden<br>Leveringen zonder aankondiging worden per direct geweigerd aan de deur.<br>Uiteraard zullen we altijd in overleg blijven met jullie om te voorkomen dat we aan beide kanten onnodig meerkosten maken.<br>Wij rekenen op uw medewerking om de leverafspraken correct na te leven.<br>Mocht u vragen hebben of een aankondiging willen doen, neem dan contact op via Expedite.hol@royalihc.com.",
      "placeholders": []
    },
    {
      "id": "onaangekondigde_levering_en",
      "naam": "Unannounced delivery",
      "taal": "EN",
      "onderwerp_issue": "Unannounced delivery",
      "toepasbaar_op_status": [
        "Released",
        "Confirmed",
        "Planned"
      ],
      "beschrijving": "Engelse variant van de onaangekondigde-leveringwaarschuwing.",
      "body_html": "Dear Supplier,<br>We would like to draw your attention to the following: deliveries that arrive at our location without prior notification will not be accepted.<br>In recent weeks, we have experienced several instances of unannounced deliveries.\nThis causes significant disruptions to our daily operations. When materials arrive unexpectedly, it results in, among other things:\n• blockages and lack of space,\n• unsafe situations,\n• delays in planning,\n• errors in registration and quality control.<br>To ensure a safe and efficient logistics environment, it is mandatory that every delivery is announced in advance, including:\n• Our labels\n• PO number / Project number\n• Packing slip\n• Any special remarks<br>Deliveries without prior notification will be refused at the door with immediate effect.\nOf course, we will always remain in close communication with you to avoid unnecessary additional costs for both parties.\nWe count on your cooperation in adhering to the delivery agreements.<br>If you have any questions or wish to submit a delivery announcement, please contact us at: Expedite.hol@royalihc.com.",
      "placeholders": []
    }
  ],
  "mail_rendering": {
    "voorkeur": ".eml-bestand (behoudt HTML + opmaak)",
    "to": "leeg laten — adres handmatig invullen",
    "cc": "optioneel Buyer Name (interne eigenaar)"
  }
};
