# Higher Education Technology Detection Documentation

## Overview

This document catalogs technology detection patterns specifically focused on higher education institutions. Our detection engine combines patterns from the open-source webappanalyzer library with custom higher education-specific patterns.

## Technology Categories

### Available in WebappAnalyzer Base Library

#### ✅ LMS (Learning Management Systems) - Category 21
- **Canvas LMS** ✅ Available in webappanalyzer
  - Detection: `x-canvas-meta` header, `webpackChunkcanvas_lms` JS object
  - Implies: Ruby on Rails, React
  
- **Moodle** ✅ Available in webappanalyzer  
  - Detection: `MOODLEID_` cookie, `MoodleSession` cookie, `M.core` JS, `moodlelogo` HTML
  - Implies: PHP

#### ✅ CRM (Customer Relationship Management) - Category 53
- **Slate** ✅ Available in webappanalyzer
  - Detection: `slate-technolutions-net.cdn.technolutions.net/` script source
  - Specific to higher education admissions

- **Ellucian CRM Recruit** ✅ Available in webappanalyzer
  - Detection: `.elluciancrmrecruit.com/` links, `Ellucian.Recruit` JS object
  - Category: 53 (CRM) + 101 (unknown category)

#### ✅ CMS (Content Management) - Category 1  
- **Drupal** ✅ Available in webappanalyzer
  - Multiple detection patterns available
  - **Drupal Commerce** and **Drupal Multisite** variants also available

### Missing from WebappAnalyzer - Need Custom Patterns

#### ❌ Student Information Systems (SIS)
**High Priority - Core Higher Ed Systems**

- **Ellucian Banner**
  - Detection patterns: `bwckgens.p_proc_term_date`, `bwskfreg.P_AltPin`, `bwckschd.p_disp_dyn_ctlg`
  - Scripts: `banner`, `ellucian`, `bwck`
  
- **Ellucian Colleague** 
  - Detection: `colleague`, `ellucian.*colleague`, `datatel`
  
- **PeopleSoft Campus Solutions**
  - Detection: `peoplesoft`, `campus.*solutions`, `PS_TOKEN`
  
- **Jenzabar**
  - Detection: `jenzabar`, `jics`, `CampusWeb`
  
- **PowerCampus**
  - Detection: `powercampus`, `eCollege`

#### ❌ Additional LMS Systems
- **Blackboard Learn** - Not in webappanalyzer
  - Detection: `blackboard.com`, `bblearn`, `ultra-ui`, `bb-base-`
  
- **D2L Brightspace** - Not in webappanalyzer  
  - Detection: `d2l.com`, `brightspace`, `desire2learn`
  
- **Sakai** - Not in webappanalyzer
  - Detection: `sakai-project`, `sakaiproject`, `/portal/site/`

#### ❌ Higher Ed CMS Systems  
- **OmniCMS** - Not in webappanalyzer
  - Detection: `omni-cms`, `omnicms.omniupdate.com`
  
- **TerminalFour** - Not in webappanalyzer
  - Detection: Terminal Four specific patterns
  
- **Modern Campus CMS** - Not in webappanalyzer
  - Detection: Modern Campus specific patterns

#### ❌ Digital Asset Management (DAM)
**Medium Priority**

- **Bynder**
- **Widen Collective** 
- **Adobe Experience Manager Assets**
- **Brandfolder**
- **Canto**

#### ❌ Library Systems
**Medium Priority**

- **Ex Libris Alma**
- **Ex Libris Primo**  
- **OCLC WorldCat**
- **Koha**
- **SirsiDynix Symphony**
- **III Sierra**

#### ❌ Student Success Platforms
- **EAB Navigate** 
- **Starfish**
- **GradesFirst**
- **Civitas Learning**

#### ❌ Authentication & Identity
**High Priority for Security Analysis**

- **Shibboleth**
- **CAS (Central Authentication Service)**
- **Active Directory Federation Services**
- **Okta for Higher Ed**
- **Auth0**

#### ❌ Financial & Administrative
- **Workday Student**
- **Oracle PeopleSoft Financials**
- **Banner Finance**
- **PowerFAIDS**
- **CollegeSource**

#### ❌ Infrastructure & CDN
**Available in webappanalyzer but should verify coverage:**

- **Cloudflare** ✅ Available
- **AWS CloudFront** - Check availability
- **Akamai** - Check availability  
- **Fastly** - Check availability
- **KeyCDN** - Check availability

### ❌ Video & Media Platforms
**Medium Priority**

- **Kaltura**
- **Panopto** 
- **Echo360**
- **YuJa**

## Detection Pattern Format

Our patterns follow the webappanalyzer format with higher education extensions:

```json
{
  "Technology Name": {
    "cats": [21],  // Category ID from webappanalyzer
    "description": "Description of the technology",
    "headers": {
      "header-name": "regex-pattern"
    },
    "html": ["regex-pattern"],
    "js": {
      "jsObjectName": ""
    },
    "cookies": {
      "cookieName": ""
    },
    "dom": ["css-selector"],
    "scriptSrc": ["regex-pattern"],
    "implies": ["Other Technology"],
    "website": "https://vendor-website.com",
    "icon": "icon-filename.svg",
    "pricing": ["poa"], // price on application
    "saas": true,
    "higher_ed": true,  // Our custom flag
    "confidence": 85    // Our confidence scoring
  }
}
```

## Implementation Priority

### Phase 1: Core Academic Systems (High Impact)
1. **Student Information Systems** - Banner, Colleague, PeopleSoft, Jenzabar
2. **Missing LMS** - Blackboard, D2L Brightspace, Sakai  
3. **Authentication Systems** - Shibboleth, CAS
4. **Higher Ed CMS** - OmniCMS, TerminalFour

### Phase 2: Extended Systems (Medium Impact)
1. **Library Systems** - Ex Libris, OCLC, Koha
2. **Digital Asset Management** - Bynder, Widen, Adobe AEM
3. **Student Success Platforms** - Navigate, Starfish
4. **Video Platforms** - Kaltura, Panopto

### Phase 3: Specialized Systems (Lower Impact)
1. **Financial Aid Systems**
2. **Event Management**
3. **Alumni Relations**
4. **Research Management**

## Current Status

### ✅ Available from WebappAnalyzer (Ready to Use)
- Canvas LMS
- Moodle  
- Slate CRM
- Ellucian CRM Recruit
- Drupal (multiple variants)
- General infrastructure (Cloudflare, web servers, programming languages)

### 🔄 Custom Patterns Needed (High Priority)
- Ellucian Banner & Colleague
- Blackboard Learn
- D2L Brightspace  
- OmniCMS
- Shibboleth/CAS authentication
- PeopleSoft Campus Solutions

### 📋 Research Required
- Verification of infrastructure coverage (AWS CloudFront, Akamai, etc.)
- Digital Asset Management systems detection methods
- Library system specific identifiers
- Video platform detection patterns

## Next Steps

1. **Audit webappanalyzer coverage** for infrastructure and common web technologies
2. **Create comprehensive SIS detection patterns** starting with Banner and Colleague  
3. **Develop authentication system patterns** for Shibboleth and CAS
4. **Build higher education CMS patterns** for OmniCMS and TerminalFour
5. **Test detection accuracy** against known higher education websites
6. **Document confidence scoring** methodology for higher education contexts

## Resources

- [WebappAnalyzer GitHub](https://github.com/enthec/webappanalyzer)
- [WebappAnalyzer Categories](https://github.com/enthec/webappanalyzer/blob/main/src/categories.json)
- [WebappAnalyzer Technologies](https://github.com/enthec/webappanalyzer/tree/main/src/technologies)
- Higher education vendor documentation and technical specifications