
---
title: Quiz compatibility tests
sidebar:
  order: 99
---

# MkDocs Quiz Compatibility Tests

This page tests the compatibility between legacy MkDocs
quiz blocks and Astro Starlight.

## Test 1 — Single correct answer

<quiz>
**What does DNS stand for?**

* [ ] Dynamic Network Service
* [x] Domain Name System
* [ ] Digital Name Server

DNS translates domain names into information such as IP addresses.
</quiz>

## Test 2 — Multiple correct answers

<quiz>
**Which protocols use TCP?**

* [x] HTTP
* [x] SSH
* [ ] ICMP
* [x] SMTP

HTTP, SSH and SMTP use TCP. ICMP does not use TCP.
</quiz>

## Test 3 — Markdown formatting

<quiz>
**Which command displays IP addresses on Linux?**

* [x] `ip addr`
* [ ] `mkdir`
* [ ] `passwd`

The command **`ip addr`** displays network interface addresses.

You can also use:

```bash
ip -br addr
```
</quiz>

## Test 4 — Quiz inside an admonition

!!! note "Knowledge check"
    wouaa

    <quiz>
    **Which port is used by HTTPS by default?**

    * [ ] 80
    * [x] 443
    * [ ] 25
    HTTPS normally uses TC P port **443**.

    </quiz>

## Test 5 — Content outside quizzes

This paragraph must remain visible and unchanged.

!!! tip "Important"

    The quiz adapter must not interfere with MkDocs admonitions.

## Test 6 — Quiz after an ad monition

<quiz>
**Which protoc ol assigns IP configuration automatically?**

* [ ] DNS
* [x] DHCP
* [ ] HTTP

DHCP can automatically provide IP configuration to clients.
</quiz>
