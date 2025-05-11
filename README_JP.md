# Prompt Pilot 拡張機能

[English](README.md) | [日本語](README_JP.md)

## 概要

**Prompt Pilot** はBooru系サイト（Danbooru, e621）タグの入力補完、および過去に入力したプロンプトからサジェストを表示する拡張機能です。

## 紹介

サジェスト機能
![Image](https://github.com/user-attachments/assets/35a2e0bd-03d1-4c64-a2bf-68333c586a40)

wikiを開く
![Image](https://github.com/user-attachments/assets/9a253523-4b1a-472a-8edf-62f0aa3e4daa)

マルチバイト文字検索
![Image](https://github.com/user-attachments/assets/c0240cbf-0ae1-48dc-ab85-da12a82971ab)

## インストール

1. Stable Diffusion Web UIの[拡張機能]タブを開く
2. [URLからインストール]を選択
3. 以下のURLを入力し、インストールを実行

```https://github.com/nihedon/sd-webui-prompt-pilot.git```

## 使い方

**!! TagAutocompleteと競合します !!**
TagAutocompleteはオフにして使用してください。

基本的な使い方はTACと同じです。
TACとの違いは以下の点です。

- タグを入力していない場合は前のタグに関連するサジェストが表示されます。これは今までに生成した画像に使用したプロンプトを解析して表示します。
- Loraを入力する場合は"&lt;lora:"と入力してからLora名を入力します。LoRAのプレビュー画像も表示されます。
- スペース区切りのタグに対応しています。
- タグ候補はTabキーで選択します。Enterキーは対応していません。
- タグ候補が表示されている状態でShift+Tabキーを押下すると選択中のタグのwikiページを開きます。

## その他の特徴

- Ctrlキーを押下しながらプロンプト内の単語をクリックすると各wikiページを開きます。
- "*"記号を入力してから単語を入力するとDanbooruタグ検索になります。マルチバイト文字のワード検索が可能です。（例："*少女"と入力すると"1girl"が候補に上がる）
- スペース区切りとするかアンダースコア区切りとするかオプションで細かく設定することができます。
- ソート順は投稿数よりも使用回数が優先されます。

## 注意

タグ提案に使用される複雑なソートメカニズムにより、多くの単語を含む長い文を入力するとパフォーマンスが大幅に低下する場合があります。
そのため、個別のタグではなく完全な文を入力するユーザーにはこの拡張機能が適さない場合があります。（主にFluxユーザー）

## 動作保証環境

- Stable Difusion Forge/reForge
- Google Chrome for Windows

## サポート

この拡張機能が便利だと感じたら、コーヒー一杯をご馳走いただけると嬉しいです☕
[Buy Me a Coffee](https://buymeacoffee.com/nihedon)
[ko-fi](https://ko-fi.com/nihedon)

## 変更履歴

- **2025/05/24**: Reactを使用したDOM描画に変更し描画効率を向上
- **2025/05/08**: 辞書データの取得方法をAPIからURL指定に変更。圧縮したデータの取得により読み込みにかかる時間を短縮
- **2025/04/15**: 初回リリース

## ライセンス

このプロジェクトは[MITライセンス](LICENSE)の下で公開されています。
